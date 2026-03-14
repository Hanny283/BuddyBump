const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * Adds iOS Screen Time entitlements for Family Controls.
 * Note: Device Activity entitlement should only be on the extension target, not the main app.
 * Local plugins referenced from app.json must be JavaScript (not TypeScript).
 */
function withScreenTimeEntitlements(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.family-controls'] = true;
    // Device Activity is only for extensions, not the main app
    return cfg;
  });
}

module.exports = withScreenTimeEntitlements;
