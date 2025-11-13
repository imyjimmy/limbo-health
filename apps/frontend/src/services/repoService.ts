import { CreateRepositoryData } from '@/types/repository';

export class RepoService {
  private static getHeaders(token: string) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  static async loadRepositories(token: string) {
    const response = await fetch('/api/mgit/user/repositories', {
      method: 'GET',
      headers: this.getHeaders(token)
    })

    if (!response.ok) {
      throw new Error(`Failed to load repositories: ${response.status}`)
    }

    return response.json()
  }

  static async createRepository(token: string, data: CreateRepositoryData) {
    const normalizedName = data.repoName.toLowerCase().replace(/\s+/g, '-')
    
    const response = await fetch('/api/mgit/repos/create', {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        repoName: normalizedName,
        userName: data.userName,
        userEmail: data.userEmail,
        description: data.description
      })
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.reason || 'Repository creation failed')
    }

    return result
  }

  static async getAuthChallenge(repoName: string) {
    const response = await fetch('/api/mgit/auth/challenge', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({repoId: repoName})
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.reason || 'Failed to get challenge')
    }

    return data
  }

  static async verifyAuth(signedEvent: any, challenge: string, repoName: string) {
    const response = await fetch('/api/mgit/auth/verify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        signedEvent,
        challenge,
        repoId: repoName
      })
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.reason || 'Verification failed')
    }

    return data
  }

  static async generateQRCode(repoName: string, token: string) {
    const response = await fetch(`/api/mgit/qr/clone/${repoName}`, {
      method: 'GET',
      headers: {'Authorization': `Bearer ${token}`}
    })

    if (!response.ok) {
      throw new Error('Failed to generate QR code')
    }

    return response.text()
  }
}