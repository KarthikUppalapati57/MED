import { Ban } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/acceptable_use_policy.md?raw';

export default function AcceptableUsePolicy() {
  return <LegalMarkdownPage markdown={markdown} icon={Ban} />;
}
