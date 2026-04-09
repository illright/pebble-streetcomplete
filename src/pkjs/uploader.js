/**
 * Stub answer uploader module.
 * TODO: implement OSM changeset upload.
 */

function submitAnswer(questType, elementType, elementId, answer, callback) {
  console.log('[SC] TODO: upload answer to OSM — '
    + questType + ' ' + elementType + '/' + elementId + ' -> ' + answer);
  callback('not implemented');
}

module.exports = {
  submitAnswer: submitAnswer,
};
