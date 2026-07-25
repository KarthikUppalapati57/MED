import { Cookie } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/cookie_policy.md?raw';

export default function CookiePolicy() {
  return <LegalMarkdownPage markdown={markdown} icon={Cookie} />;
}
