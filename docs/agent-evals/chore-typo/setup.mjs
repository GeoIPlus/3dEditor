import { edit } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) => edit(work, 'STRUCTURE.md', (s) => s.replace('Dependency rules', 'Dependancy rules'));
