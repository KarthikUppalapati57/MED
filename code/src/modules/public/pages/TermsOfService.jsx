import { Shield } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/terms_of_service.md?raw';

export default function TermsOfService() {
  return <LegalMarkdownPage markdown={markdown} icon={Shield} />;
}
