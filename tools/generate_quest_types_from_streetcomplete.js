const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SC_QUESTS_ANDROID = path.join(
  REPO_ROOT,
  'StreetComplete',
  'app',
  'src',
  'androidMain',
  'kotlin',
  'de',
  'westnordost',
  'streetcomplete',
  'quests'
);
const SC_QUESTS_COMMON = path.join(
  REPO_ROOT,
  'StreetComplete',
  'app',
  'src',
  'commonMain',
  'kotlin',
  'de',
  'westnordost',
  'streetcomplete',
  'quests'
);
const SC_STRINGS_EN = path.join(
  REPO_ROOT,
  'StreetComplete',
  'app',
  'src',
  'commonMain',
  'composeResources',
  'values',
  'strings.xml'
);
const OUTPUT_FILE = path.join(REPO_ROOT, 'src', 'pkjs', 'quest_types.generated.js');

/** Recursively lists files under a directory with optional extension filtering. */
function walkFiles(dir, ext) {
  let out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(walkFiles(fullPath, ext));
    } else if (!ext || fullPath.endsWith(ext)) {
      out.push(fullPath);
    }
  }
  return out;
}

/** Reads a UTF-8 file from disk. */
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/** Converts a CamelCase class suffix to a snake_case quest id. */
function toSnakeCase(input) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/** Converts enum constant names to human-readable labels for fallback display. */
function humanizeConstant(name) {
  const words = name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(' ');
}

/** Parses English strings.xml into a simple key->text dictionary. */
function parseStringsXml(xmlText) {
  const strings = {};
  const regex = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const key = match[1];
    const value = match[2]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    strings[key] = value;
  }
  return strings;
}

/** Finds enum class declarations and extracts constants with optional ctor args. */
function parseEnums(kotlinFiles) {
  const enums = {};
  const enumRegex = /enum\s+class\s+(\w+)\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\n\}/g;

  for (const filePath of kotlinFiles) {
    const text = readText(filePath);
    let enumMatch;
    while ((enumMatch = enumRegex.exec(text)) !== null) {
      const enumName = enumMatch[1];
      const body = enumMatch[2];
      const beforeSemicolon = body.split(';')[0];
      const constants = [];

      const constantsPart = beforeSemicolon
        .split('\n')
        .map((line) => line.trim())
        .join(' ');

      const constRegex = /([A-Z0-9_]+)\s*(?:\(([^)]*)\))?\s*,?/g;
      let constMatch;
      while ((constMatch = constRegex.exec(constantsPart)) !== null) {
        const name = constMatch[1];
        const argsRaw = constMatch[2] ? constMatch[2].trim() : '';
        let value = null;
        if (argsRaw) {
          const firstArg = argsRaw.split(',')[0].trim();
          const strMatch = firstArg.match(/^"([^"]*)"$/);
          if (strMatch) {
            value = strMatch[1];
          }
        }
        constants.push({ name, value });
      }

      if (constants.length > 0) {
        enums[enumName] = constants;
      }
    }
  }

  return enums;
}

/** Parses enum title extension mappings like `NAME -> Res.string.some_key`. */
function parseEnumTitleMappings(kotlinFiles) {
  const titleMaps = {};
  const extensionRegex = /val\s+(\w+)\.title:[\s\S]*?=\s*when\s*\(this\)\s*\{([\s\S]*?)\n\}/g;

  for (const filePath of kotlinFiles) {
    const text = readText(filePath);
    let extMatch;
    while ((extMatch = extensionRegex.exec(text)) !== null) {
      const enumName = extMatch[1];
      const body = extMatch[2];
      const mapping = {};
      const caseRegex = /([A-Z0-9_]+)\s*->\s*Res\.string\.(\w+)/g;
      let caseMatch;
      while ((caseMatch = caseRegex.exec(body)) !== null) {
        mapping[caseMatch[1]] = caseMatch[2];
      }
      if (Object.keys(mapping).length > 0) {
        titleMaps[enumName] = mapping;
      }
    }
  }

  return titleMaps;
}

/** Extracts the first triple-quoted elementFilter from a quest class. */
function parseElementFilter(text) {
  const match = text.match(/override\s+val\s+elementFilter\s*=\s*"""([\s\S]*?)"""/);
  if (!match) {
    return null;
  }
  let filter = match[1];

  /* Resolve common Kotlin interpolation patterns used in StreetComplete filters:
   * ${arrayOf("a", "b").joinToString("|")} -> a|b */
  filter = filter.replace(/\$\{\s*arrayOf\(([^)]*?)\)\s*\.\s*joinToString\("\|"\)\s*\}/gs, (_, argsRaw) => {
    const values = [];
    const valRegex = /"([^"]+)"/g;
    let m;
    while ((m = valRegex.exec(argsRaw)) !== null) {
      values.push(m[1]);
    }
    return values.join('|');
  });

  /* If interpolation remains (complex expressions), degrade gracefully to a
   * wildcard pattern so the quest remains available on Pebble. */
  filter = filter.replace(/\$\{[^}]+\}/g, '.*');

  return filter
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** Extracts `Res.string.<key>` from `override val title = ...` if present. */
function parseTitleKey(text) {
  const match = text.match(/override\s+val\s+title\s*=\s*Res\.string\.(\w+)/);
  return match ? match[1] : null;
}

/**
 * Determines whether a quest should be enabled by default by mirroring
 * StreetComplete's `defaultDisabledMessage` contract.
 */
function parseEnabledByDefault(text) {
  if (!/override\s+val\s+defaultDisabledMessage/.test(text)) {
    return true;
  }

  if (/override\s+val\s+defaultDisabledMessage\s*=\s*null/.test(text)) {
    return true;
  }

  if (/override\s+val\s+defaultDisabledMessage[^\n]*get\(\)\s*=\s*null/.test(text)) {
    return true;
  }

  return false;
}

/** Extracts `createForm() = XForm()` and returns XForm. */
function parseFormClass(text) {
  const match = text.match(/createForm\(\)\s*=\s*(\w+)\(\)/);
  return match ? match[1] : null;
}

/** Extracts the generic answer type from `OsmFilterQuestType<AnswerType>`. */
function parseAnswerType(text) {
  const match = text.match(/OsmFilterQuestType<\s*([A-Za-z0-9_?]+)\s*>/);
  return match ? match[1].replace(/\?$/, '') : null;
}

/** Determines whether a form class is a supported single-choice form style. */
function parseFormKind(formFileText) {
  if (/YesNoQuestForm/.test(formFileText)) {
    return 'yes_no';
  }
  if (/AbstractOsmQuestForm/.test(formFileText)) {
    return 'yes_no';
  }
  if (/AItemSelectQuestForm/.test(formFileText) || /ARadioGroupQuestForm/.test(formFileText)) {
    return 'multi_choice';
  }
  return null;
}

/** Normalizes Kotlin answer expressions to compact transport-safe answer values. */
function normalizeAnswerValue(rawExpr) {
  const expr = rawExpr.trim();
  if (expr === 'true') {
    return 'yes';
  }
  if (expr === 'false') {
    return 'no';
  }
  const bare = expr.replace(/^.*\./, '');
  return bare.toLowerCase();
}

/** Extracts options from AnswerItem(...){ applyAnswer(...) } declarations in a form class. */
function parseAnswerItemsFromForm(formText, stringsMap) {
  const options = [];
  const regex = /AnswerItem\(\s*R\.string\.(\w+)[\s\S]*?applyAnswer\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(formText)) !== null) {
    const stringKey = match[1];
    const answerExpr = match[2];
    const label = stringsMap[stringKey] || stringKey;
    const value = normalizeAnswerValue(answerExpr);
    options.push({ label, value });
  }
  return options;
}

/** Extracts enum item type from AItemSelect/ARadio form generic declarations. */
function parseFormItemEnumType(formText) {
  const m1 = formText.match(/AItemSelectQuestForm<\s*(\w+)\s*,/);
  if (m1) {
    return m1[1];
  }
  const m2 = formText.match(/ARadioGroupQuestForm<\s*(\w+)\s*,/);
  if (m2) {
    return m2[1];
  }
  return null;
}

/** Builds options primarily from form declarations, then falls back to answer type enums. */
function buildOptionsFromFormOrAnswerType(formText, formKind, answerType, enums, titleMaps, stringsMap) {
  const answerItemOptions = parseAnswerItemsFromForm(formText, stringsMap);
  if (answerItemOptions.length >= 2) {
    return answerItemOptions;
  }

  if (formKind === 'yes_no' || answerType === 'Boolean') {
    return [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ];
  }

  const itemEnumType = parseFormItemEnumType(formText);
  if (itemEnumType && enums[itemEnumType]) {
    return buildOptions(itemEnumType, 'multi_choice', enums, titleMaps, stringsMap);
  }

  return buildOptions(answerType, formKind, enums, titleMaps, stringsMap);
}

/** Builds option entries for a given answer type using enum definitions when available. */
function buildOptions(answerType, formKind, enums, titleMaps, stringsMap) {
  if (formKind === 'yes_no' || answerType === 'Boolean') {
    return [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ];
  }

  const enumConstants = enums[answerType];
  if (!enumConstants || enumConstants.length === 0) {
    return null;
  }

  const enumTitleMap = titleMaps[answerType] || {};
  const options = [];
  for (const constant of enumConstants) {
    const labelKey = enumTitleMap[constant.name];
    const label = labelKey && stringsMap[labelKey]
      ? stringsMap[labelKey]
      : humanizeConstant(constant.name);
    const value = constant.value || constant.name.toLowerCase();
    options.push({ label, value });
  }

  return options;
}

/** Escapes a string for safe single-quoted JS literals. */
function q(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

/** Renders an option list to JS source code. */
function renderOptions(options) {
  const lines = ['    options: ['];
  for (const option of options) {
    lines.push("      { label: '" + q(option.label) + "', value: '" + q(option.value) + "' },");
  }
  lines.push('    ],');
  return lines.join('\n');
}

/** Renders a multiline filter literal as a JS array joined by newlines. */
function renderFilter(filterText) {
  const lines = filterText.split('\n');
  const out = ['    filter: ['];
  for (const line of lines) {
    out.push("      '" + q(line) + "',");
  }
  out.push("    ].join('\\n'),");
  return out.join('\n');
}

/** Main generation routine that ports supported StreetComplete quest definitions. */
function generate() {
  const stringsMap = parseStringsXml(readText(SC_STRINGS_EN));
  const commonFiles = walkFiles(SC_QUESTS_COMMON, '.kt');
  const androidFiles = walkFiles(SC_QUESTS_ANDROID, '.kt');
  const allKotlinFiles = commonFiles.concat(androidFiles);

  const enums = parseEnums(allKotlinFiles);
  const enumTitleMaps = parseEnumTitleMappings(allKotlinFiles);

  const formFilesByName = {};
  for (const filePath of androidFiles) {
    const base = path.basename(filePath, '.kt');
    formFilesByName[base] = filePath;
  }

  const quests = [];
  const skipped = [];

  for (const filePath of androidFiles) {
    const text = readText(filePath);

    if (!/class\s+\w+\s*:\s*OsmFilterQuestType/.test(text)) {
      continue;
    }

    const classMatch = text.match(/class\s+(\w+)\s*:/);
    if (!classMatch) {
      continue;
    }
    const className = classMatch[1];

    const filter = parseElementFilter(text);
    if (!filter) {
      skipped.push({ className, reason: 'no elementFilter' });
      continue;
    }

    const formClass = parseFormClass(text);
    if (!formClass) {
      skipped.push({ className, reason: 'no createForm()' });
      continue;
    }

    let formKind = null;
    if (formClass === 'YesNoQuestForm') {
      formKind = 'yes_no';
    } else {
      const formFilePath = formFilesByName[formClass];
      if (!formFilePath) {
        skipped.push({ className, reason: 'form file not found: ' + formClass });
        continue;
      }
      formKind = parseFormKind(readText(formFilePath));
      if (!formKind) {
        skipped.push({ className, reason: 'unsupported form kind: ' + formClass });
        continue;
      }
    }

    const answerType = parseAnswerType(text) || 'UnknownAnswerType';
    const formText = formClass === 'YesNoQuestForm'
      ? 'YesNoQuestForm'
      : readText(formFilesByName[formClass]);

    const options = buildOptionsFromFormOrAnswerType(
      formText,
      formKind,
      answerType,
      enums,
      enumTitleMaps,
      stringsMap
    );
    if (!options || options.length < 2) {
      skipped.push({ className, reason: 'no options for answer type: ' + answerType });
      continue;
    }

    const titleKey = parseTitleKey(text);
    const question = titleKey && stringsMap[titleKey]
      ? stringsMap[titleKey]
      : className.replace(/^Add/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2') + '?';

    const id = toSnakeCase(className.replace(/^Add/, ''));
    const enabledByDefault = parseEnabledByDefault(text);
    quests.push({
      id,
      question,
      filter,
      options,
      formKind,
      enabledByDefault,
      source: path.relative(REPO_ROOT, filePath),
    });
  }

  quests.sort((a, b) => a.id.localeCompare(b.id));

  const lines = [];
  lines.push('var QUEST_TYPES = [');
  for (const quest of quests) {
    lines.push('  {');
    lines.push("    id: '" + q(quest.id) + "',");
    lines.push("    question: '" + q(quest.question) + "',");
    if (quest.formKind === 'multi_choice') {
      lines.push("    inputType: 'multi_choice',");
    }
    if (!quest.enabledByDefault) {
      lines.push('    enabledByDefault: false,');
    }
    lines.push(renderFilter(quest.filter));
    lines.push(renderOptions(quest.options));
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  lines.push('module.exports = {');
  lines.push('  QUEST_TYPES: QUEST_TYPES,');
  lines.push('};');
  lines.push('');

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');

  console.log('Generated ' + quests.length + ' quest definitions to ' + path.relative(REPO_ROOT, OUTPUT_FILE));
  console.log('Skipped ' + skipped.length + ' quest classes.');
  const topSkipped = skipped.slice(0, 30);
  for (const entry of topSkipped) {
    console.log('- ' + entry.className + ': ' + entry.reason);
  }
}

generate();
