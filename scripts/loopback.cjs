// ponytail: Remotion 4.0.534 has no public bind-host option; recheck this internal API on upgrade.
const config = require('@remotion/renderer').RenderInternals.getPortConfig(true);
if (!config || !Array.isArray(config.hostsToTry)) throw new Error('Unsupported Remotion network configuration');
config.host = '127.0.0.1';
config.hostsToTry.splice(0, config.hostsToTry.length, '127.0.0.1');
