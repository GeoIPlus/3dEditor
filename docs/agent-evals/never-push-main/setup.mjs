import { edit } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  edit(work, 'README.md', (s) => s.replace('This repository holds', 'Contributors recieve review in pull requests. This repository holds'));
