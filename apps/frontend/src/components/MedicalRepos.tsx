import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Plus, FolderOpen, QrCode, Key } from "lucide-react"
import { MedicalRepository, CreateRepositoryData } from '../types/repository'
import { RepoService } from '../services/repoService'

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent: (event: any) => Promise<any>
    }
  }
}

interface MedicalReposProps {
  token: string
}

export function MedicalRepos({ token }: MedicalReposProps) {
  const [repositories, setRepositories] = useState<MedicalRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState<CreateRepositoryData>({
    repoName: '',
    userName: '',
    userEmail: '',
    description: ''
  })

  useEffect(() => {
    loadRepositories()
  }, [token])

  const loadRepositories = async () => {
    setLoading(true)
    setError(null)
    try {
      const repos = await RepoService.loadRepositories(token)
      setRepositories(repos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRepository = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.repoName.trim() || !formData.userName.trim() || !formData.userEmail.trim()) {
      setError('Please fill in all required fields')
      return
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(formData.repoName)) {
      setError('Repository name can only contain letters, numbers, spaces, hyphens, and underscores')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const result = await RepoService.createRepository(token, {
        ...formData,
        description: `Medical records of ${formData.userName}, email: ${formData.userEmail}`
      })

      setSuccess(`Repository "${result.repoId}" created successfully!`)
      setShowCreateForm(false)
      setFormData({ repoName: '', userName: '', userEmail: '', description: '' })
      loadRepositories() // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create repository')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading repositories...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Medical Repositories</h1>
          <p className="text-muted-foreground">Manage your secure medical data repositories</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Repository
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Create Repository Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Medical Repository</CardTitle>
            <CardDescription>
              Create a secure, self-custodial medical history repository linked to your Nostr identity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRepository} className="space-y-4">
              <div>
                <Label htmlFor="repoName">Repository Name *</Label>
                <Input
                  id="repoName"
                  placeholder="My Health Records"
                  value={formData.repoName}
                  onChange={(e) => setFormData(prev => ({ ...prev, repoName: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="userName">Your Name *</Label>
                <Input
                  id="userName"
                  placeholder="Dr. Jane Smith"
                  value={formData.userName}
                  onChange={(e) => setFormData(prev => ({ ...prev, userName: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="userEmail">Your Email *</Label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="jane.smith@clinic.com"
                  value={formData.userEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, userEmail: e.target.value }))}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Repository
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Existing Repositories */}
      <Card>
        <CardHeader>
          <CardTitle>Your Existing Repositories</CardTitle>
        </CardHeader>
        <CardContent>
          {repositories.length === 0 ? (
            <p className="text-muted-foreground">No repositories found. Create your first repository above!</p>
          ) : (
            <div className="space-y-4">
              {repositories.map((repo) => (
                <RepositoryCard key={repo.name} repository={repo} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RepositoryCard({ repository }: { repository: MedicalRepository }) {
  const [showAuth, setShowAuth] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [repoToken, setRepoToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGetAccess = async () => {
    if (!window.nostr?.signEvent) {
      setError('No Nostr extension found. Please install nos2x or similar.')
      return
    }

    setAuthLoading(true)
    setError(null)

    try {
      // Get challenge
      const challengeData = await RepoService.getAuthChallenge(repository.name)
      
      // Sign with nostr extension
      const event = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: `MGit auth challenge: ${challengeData.challenge}`
      }
      
      const signedEvent = await window.nostr.signEvent(event)
      
      // Verify and get token
      const verifyData = await RepoService.verifyAuth(signedEvent, challengeData.challenge, repository.name)
      
      // Generate QR code
      const qrSvg = await RepoService.generateQRCode(repository.name, verifyData.token)
      
      setQrCode(qrSvg)
      setRepoToken(verifyData.token)
      setShowAuth(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {repository.name}
        </CardTitle>
        <CardDescription>
          <div>Created: {new Date(repository.created).toLocaleDateString()}</div>
          <div>Access Level: {repository.access}</div>
          {repository.description && <div>Description: {repository.description}</div>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {showAuth ? (
          <div className="border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950/20 p-4 rounded">
            <h4 className="font-semibold text-orange-700 dark:text-orange-300 mb-2">
              Repository Access Required
            </h4>
            <p className="text-sm text-orange-600 dark:text-orange-400 mb-4">
              Generate a secure access token for this repository to get the mobile QR code
            </p>
            {error && (
              <div className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</div>
            )}
            <Button onClick={handleGetAccess} disabled={authLoading} variant="outline">
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
              Get Repository Access
            </Button>
          </div>
        ) : (
          <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20 p-4 rounded">
            <h4 className="font-semibold text-green-700 dark:text-green-300 mb-4 flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Scan with Medical Binder App
            </h4>
            
            {qrCode && (
              <div className="text-center mb-4" dangerouslySetInnerHTML={{ __html: qrCode }} />
            )}
            
            {repoToken && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor={`token-${repository.name}`}>Repository JWT Token:</Label>
                  <Textarea
                    id={`token-${repository.name}`}
                    value={repoToken}
                    readOnly
                    className="font-mono text-xs h-20"
                  />
                </div>
                
                <div>
                  <Label>Debug Command:</Label>
                  <code className="block bg-muted p-3 rounded text-xs break-all">
                    mgit clone -jwt {repoToken} {window.location.protocol}//{window.location.host}/{repository.name}
                  </code>
                  <p className="text-xs text-muted-foreground mt-1">
                    Copy and run this command in terminal to test mgit clone manually
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}