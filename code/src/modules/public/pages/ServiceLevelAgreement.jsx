import { Gauge } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/service_level_agreement.md?raw';

export default function ServiceLevelAgreement() {
  return <LegalMarkdownPage markdown={markdown} icon={Gauge} />;
}
