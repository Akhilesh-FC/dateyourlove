let activeAdminSessionId = null;

function getActiveAdminSessionId() {
  return activeAdminSessionId;
}

function setActiveAdminSessionId(sessionId) {
  activeAdminSessionId = sessionId;
}




function clearActiveAdminSessionId() {
  activeAdminSessionId = null;
}

module.exports = {
  getActiveAdminSessionId,
  setActiveAdminSessionId,
  clearActiveAdminSessionId,
};
