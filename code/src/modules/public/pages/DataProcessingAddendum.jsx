import { FileLock2 } from 'lucide-react';
import LegalMarkdownPage from '../components/LegalMarkdownPage';
import markdown from '../../../../docs/legal/data_processing_addendum.md?raw';

export default function DataProcessingAddendum() {
  return <LegalMarkdownPage markdown={markdown} icon={FileLock2} />;
}
