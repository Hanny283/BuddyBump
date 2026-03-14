import { ConfigPlugin, withEntitlementsPlist } from '@expo/config-plugins';

const withScreenTimeEntitlements: ConfigPlugin = (config) => {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.family-controls'] = true;
    cfg.modResults['com.apple.developer.device-activity'] = true;
    // These enable Family Controls / Device Activity APIs
    return cfg;
  });
};

export default withScreenTimeEntitlements;

