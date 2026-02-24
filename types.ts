
export enum AppState {
  LOGIN,
  PROFILE_ERROR,
  BIODATA,
  TOKEN_ENTRY,
  CONFIRMATION,
  TESTING,
  FINISHED,
  ADMIN_DASHBOARD,
  TEACHER_DASHBOARD, // State baru untuk Panel Guru
}

export enum AdminView {
  HOME,
  DATA_MASTER,
  QUESTION_BANK,
  JADWAL_UJIAN,
  UBK,
  CETAK,
  CETAK_DOKUMEN,
  ANALISA_SOAL,
  REKAPITULASI_NILAI,
  PENGUMAN,
  MANAJEMEN_USER,
  BACKUP_DATA,
  CONFIG,
  CETAK_ADMIN_CARD,
}

// Menu khusus untuk Guru (Lebih sederhana dari Admin)
export enum TeacherView {
  HOME,
  QUESTION_BANK,
  JADWAL_UJIAN,
  REKAPITULASI_NILAI,
  ANALISA_SOAL,
}

export type QuestionType = 'multiple_choice' | 'complex_multiple_choice' | 'matching' | 'essay' | 'true_false';

export type ScheduleStatus = 'Berlangsung' | 'Akan Datang' | 'Selesai';

export interface AppConfig {
  schoolName: string;
  logoUrl: string;
  leftLogoUrl?: string; 
  primaryColor: string;
  enableAntiCheat: boolean;
  antiCheatViolationLimit: number;
  allowStudentManualLogin: boolean;
  allowStudentQrLogin: boolean;
  allowAdminManualLogin: boolean;
  allowAdminQrLogin: boolean;
  headmasterName?: string;
  headmasterNip?: string;
  cardIssueDate?: string;
  signatureUrl?: string;
  stampUrl?: string;
  studentDataSheetUrl?: string;
  emailDomain: string;
  schoolAddress?: string;
  schoolDistrict?: string;
  schoolCode?: string;
  regionCode?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  defaultPaperSize?: string;
  kopHeader1?: string;
  kopHeader2?: string;
  currentExamEvent?: string;
  academicYear?: string;
  schoolDomain?: string; // Menambahkan schoolDomain agar konsisten
}

export interface User {
  id: string;
  username: string;
  password?: string;
  qr_login_password?: string;
  fullName: string;
  nisn: string;
  class: string;
  major: string;
  gender: 'Laki-laki' | 'Perempuan';
  religion: string;
  photoUrl: string;
  updated_at?: string;
  role?: string;
  password_text?: string;
}

export type QuestionDifficulty = 'Easy' | 'Medium' | 'Hard';
export type CognitiveLevel = 'L1' | 'L2' | 'L3';

export interface MatchingItem {
  id: string;
  content: string;
}

export interface Question {
  id: number;
  test_id?: string; // Added to support backend mapping
  type: QuestionType;
  question: string;
  image?: string;
  audio?: string;
  video?: string;
  options: string[]; 
  optionImages?: string[];
  matchingRightOptions?: string[]; 
  correctAnswerIndex: number; 
  answerKey: any; 
  metadata?: {
    matchingLeft?: MatchingItem[];
    matchingRight?: MatchingItem[];
  };
  difficulty: QuestionDifficulty;
  cognitiveLevel?: CognitiveLevel;
  weight: number;
  topic?: string;
}

export interface Answer {
  value: any; 
  unsure: boolean;
}

export interface TestDetails {
  id: string;
  token?: string;
  name: string;
  subject: string;
  time: string;
  duration: string;
  durationMinutes: number;
  questionsToDisplay?: number;
  randomizeQuestions?: boolean;
  randomizeAnswers?: boolean;
  examType?: string; 
  questionCount?: number; // New field for optimized loading
}

export interface Test {
  details: TestDetails;
  questions: Question[];
}

export interface MasterDataItem {
  id: string;
  name: string;
  created_at?: string;
}

export interface MasterData {
  classes: MasterDataItem[];
  majors: MasterDataItem[];
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
}

export interface Schedule {
  id: string;
  testToken: string;
  startTime: string;
  endTime: string;
  assignedTo: string[];
}

export enum ImportStatus {
  VALID_NEW,
  VALID_UPDATE,
  INVALID_DUPLICATE_IN_FILE,
  INVALID_MISSING_FIELDS,
}

export interface ValidatedUserRow extends Partial<Omit<User, 'id'>> {
  status: ImportStatus;
  message: string;
  rowNumber: number;
}
