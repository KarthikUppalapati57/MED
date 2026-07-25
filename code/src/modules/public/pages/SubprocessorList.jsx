import { Network } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/subprocessor_list.md?raw';

export default function SubprocessorList() {
  return <LegalMarkdownPage markdown={markdown} icon={Network} />;
}
