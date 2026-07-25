import { Lock } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/privacy_policy.md?raw';

export default function PrivacyPolicy() {
  return <LegalMarkdownPage markdown={markdown} icon={Lock} />;
}
