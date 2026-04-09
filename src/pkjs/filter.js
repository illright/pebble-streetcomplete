/**
 * Evaluates one atomic filter clause to keep quest filter matching composable.
 */
function evaluateCondition(tags, condition) {
  condition = condition.trim();

  var olderMatch = condition.match(/^(\S+)\s+older\s+today\s+-\d+\s+years?$/);
  if (olderMatch) {
    return !(olderMatch[1] in tags);
  }

  if (condition.charAt(0) === '!') {
    return !(condition.slice(1).trim() in tags);
  }

  var notTildeMatch = condition.match(/^(\S+)\s+!~\s+(.+)$/);
  if (notTildeMatch) {
    var k = notTildeMatch[1];
    var p = notTildeMatch[2].trim();
    if (!(k in tags)) {
      return true;
    }
    return !(new RegExp('^(' + p + ')$').test(tags[k]));
  }

  var tildeMatch = condition.match(/^(\S+)\s+~\s+(.+)$/);
  if (tildeMatch) {
    var k2 = tildeMatch[1];
    var p2 = tildeMatch[2].trim();
    if (!(k2 in tags)) {
      return false;
    }
    return new RegExp('^(' + p2 + ')$').test(tags[k2]);
  }

  var neqMatch = condition.match(/^(\S+)\s+!=\s+(.+)$/);
  if (neqMatch) {
    return tags[neqMatch[1].trim()] !== neqMatch[2].trim();
  }

  var eqMatch = condition.match(/^(\S+)\s+=\s+(.+)$/);
  if (eqMatch) {
    return tags[eqMatch[1].trim()] === eqMatch[2].trim();
  }

  return condition in tags;
}

/**
 * Splits top-level AND clauses while preserving nested parenthesized groups.
 */
function splitOnAnd(expr) {
  var parts = [];
  var depth = 0;
  var current = '';
  var i = 0;

  while (i < expr.length) {
    if (expr[i] === '(') {
      depth++;
      current += expr[i];
    } else if (expr[i] === ')') {
      depth--;
      current += expr[i];
    } else if (depth === 0 && expr.slice(i, i + 4).toLowerCase() === ' and') {
      parts.push(current.trim());
      current = '';
      i += 4;
      continue;
    } else {
      current += expr[i];
    }
    i++;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Resolves OR groups recursively so filter precedence matches StreetComplete semantics.
 */
function evaluateOrGroup(tags, expr) {
  expr = expr.trim();
  if (expr.charAt(0) === '(' && expr.charAt(expr.length - 1) === ')') {
    expr = expr.slice(1, -1).trim();
  }

  var parts = expr.split(/\s+or\s+/i);
  for (var i = 0; i < parts.length; i++) {
    if (evaluateAndExpr(tags, parts[i].trim())) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates AND chains with nested groups to implement the supported filter DSL subset.
 */
function evaluateAndExpr(tags, expr) {
  var parts = splitOnAnd(expr);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.charAt(0) === '(' && part.charAt(part.length - 1) === ')') {
      if (!evaluateOrGroup(tags, part)) {
        return false;
      }
    } else if (!evaluateCondition(tags, part)) {
      return false;
    }
  }
  return true;
}

/**
 * Applies type gating first, then evaluates tag predicates for quest applicability.
 */
function matchesFilter(element, filterStr) {
  var withIdx = filterStr.indexOf(' with');
  if (withIdx === -1) {
    return false;
  }

  var typesPart = filterStr.slice(0, withIdx).trim().toLowerCase();
  var condsPart = filterStr.slice(withIdx + 5).trim();
  var allowed = typesPart.split(',').map(function(t) {
    return t.trim().replace(/s$/, '');
  });

  if (allowed.indexOf(element.type) === -1) {
    return false;
  }

  return evaluateAndExpr(element.tags, condsPart);
}

module.exports = {
  matchesFilter: matchesFilter,
};
