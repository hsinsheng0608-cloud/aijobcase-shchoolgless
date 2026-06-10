
export enum UserRole {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}

export interface User {
  id: string;
  studentId: string;
  name: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
}

export interface Course {
  id: string;
  name: string;
  description: string;
  teacher_id?: string;
  teacher_name?: string;
  student_count?: number;
  status?: string;
  joined?: boolean;  // 學生瀏覽課程時：是否已加入
}

export interface Material {
  id: string;
  course_id: string;
  title: string;
  type: 'PDF' | 'DOCX' | 'PPTX' | 'XLSX';
  original_filename?: string;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  chunk_count?: number;
  error_message?: string;
  created_at?: string;
  has_file?: boolean;  // 後端是否保存原始檔（供預覽/下載）
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  sources?: any[];
  timestamp?: string;
  created_at?: string;
}

export interface ExamQuestion {
  id: string;
  course_id: string;
  question_type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'FILL_BLANK';
  question_text: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  difficulty: number;
  source: 'AI' | 'UPLOAD' | 'MANUAL';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export interface StudentAttempt {
  id: string;
  question_id: string;
  student_answer: string;
  is_correct: boolean;
  ai_feedback?: string;
  created_at?: string;
}
