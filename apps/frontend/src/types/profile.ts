export interface ProviderProfile {
  userId: number;
  username?: string;
  
  // Identity (from TX Med Board)
  firstName: string;
  lastName: string;
  suffix?: string;
  bio?: string;
  profilePic?: string; // url
  
  // working timezone etc
  timezone: string;
  workingPlan: any;

  // License information
  licenseNumber: string;
  licenseState?: string;

  licenseIssuedDate?: string;
  licenseExpirationDate?: string;
  registrationStatus?: string; // AC, ACN, etc.
  registrationDate?: string;
  methodOfLicensure?: string; // E, R, L, C
  
  // Education
  medicalSchool: string;
  graduationYear: number;
  degreeType: string; // MD, DO
  
  // Specialties
  primarySpecialty?: string;
  secondarySpecialty?: string;
  
  // Demographics (for verification)
  yearOfBirth?: number;
  placeOfBirth?: string;
  gender?: string; // M, F
  
  // Additional optional fields not in TX Med Board

  languages?: string[]; // Stored as JSON in DB
  boardCertifications?: string[]; // Stored as JSON in DB
  profilePicture?: string;
  phoneNumber?: string;
  email?: string;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}