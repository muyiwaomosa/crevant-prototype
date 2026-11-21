// Build metadata. In the repository it is always 'unstamped'. The founder's
// deploy script (scripts/functions/deploy.sh) overwrites this file ONLY in the
// temporary export it deploys, with '<commit>.<source digest>', so every
// response says which approved commit and source it came from
// (X-Splitpost-Build). scripts/functions/verify.mjs checks it independently.
export const BUILD = 'unstamped'
