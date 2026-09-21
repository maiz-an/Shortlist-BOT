import { toPlainText } from '../../common/utils/sanitize';

export const sanitizeNote = (s: string) => toPlainText(s);
