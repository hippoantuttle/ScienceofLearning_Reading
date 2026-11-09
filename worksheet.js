const Worksheet = (() => {
  function validate(values) {
    const missing = ['main', 'primary', 'support', 'relation'].filter((key) => !String(values[key] || '').trim());
    return { valid: missing.length === 0, missing };
  }
  return { validate };
})();
if (typeof module !== 'undefined') module.exports = Worksheet;
