import { MessageSquareText } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/sms_terms_and_conditions.md?raw';

export default function SmsTermsAndConditions() {
  return <LegalMarkdownPage markdown={markdown} icon={MessageSquareText} />;
}
