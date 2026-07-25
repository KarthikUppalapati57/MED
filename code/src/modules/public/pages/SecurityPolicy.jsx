import { ShieldCheck } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/security_policy.md?raw';

export default function SecurityPolicy() {
  return <LegalMarkdownPage markdown={markdown} icon={ShieldCheck} />;
}
