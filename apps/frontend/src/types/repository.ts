export interface MedicalRepository {
  name: string
  created: string
  description?: string
  access: string
}

export interface CreateRepositoryData {
  repoName: string
  userName: string
  userEmail: string
  description: string
}