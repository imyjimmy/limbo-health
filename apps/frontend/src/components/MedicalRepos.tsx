import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Plus, FolderOpen, Lock, CheckCircle2, QrCode, Key } from "lucide-react"
import { MedicalRepository, CreateRepositoryData } from '../types/repository'
import { RepoService } from '../services/repoService'
import { useAuth } from '../contexts/AuthContext'
import { 
  createEncryptedRepo, 
  commitEncrypted, 
  pushToServer,
  MedicalHistoryData 
} from '../lib/encryptedGit'
import { checkNostrExtension } from '../lib/utils'
import { NostrProfile } from '@/types'

interface MedicalReposProps {
  token: string
}

export function MedicalRepos({ token }: MedicalReposProps) {
  const { pubkey, profile } = useAuth()
  const [repositories, setRepositories] = useState<MedicalRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [creationSteps, setCreationSteps] = useState<string[]>([])

  const [formData, setFormData] = useState<CreateRepositoryData>({
    repoName: '',
    userName: profile 
    ? ('pubkey' in profile 
        ? (profile.name || profile.display_name || '') 
        : (profile.username || profile.firstName || ''))
    : '',
    userEmail: (profile && 'email' in profile) ? profile.email : '',
    description: ''
  })

  useEffect(() => {
    loadRepositories()
  }, [token])

  useEffect(() => {
    // Update form with profile data when available
    if (profile) {
      setFormData(prev => ({
        ...prev,
        userName: profile 
        ? ('pubkey' in profile 
            ? (profile.name || profile.display_name || '') 
            : (profile.username || profile.firstName || ''))
        : '',
        userEmail: (profile && 'email' in profile) ? profile.email : '',
          }))
    }
  }, [profile])

  const loadRepositories = async () => {
    setLoading(true)
    setError(null)
    try {
      const repos = await RepoService.loadRepositories(token)
      console.log('repos: ', repos);
      setRepositories(repos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories')
    } finally {
      setLoading(false)
    }
  }

  const addStep = (step: string) => {
    setCreationSteps(prev => [...prev, step])
  }

  const handleCreateRepository = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate form
    if (!formData.repoName.trim() || !formData.userName.trim() || !formData.userEmail.trim()) {
      setError('Please fill in all required fields')
      return
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(formData.repoName)) {
      setError('Repository name can only contain letters, numbers, spaces, hyphens, and underscores')
      return
    }

    // Check for nos2x extension
    try {
      checkNostrExtension()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nostr extension required')
      return
    }

    if (!pubkey) {
      setError('No public key found. Please log in again.')
      return
    }

    setCreating(true)
    setError(null)
    setSuccess(null)
    setCreationSteps([])

    try {
      // Normalize repo name (replace spaces with hyphens)
      const normalizedRepoName = formData.repoName.trim().replace(/\s+/g, '-').toLowerCase()
      
      // Step 1: Initialize local encrypted repository
      addStep('Initializing local encrypted repository...')
      const dir = await createEncryptedRepo(
        normalizedRepoName,
        formData.userName,
        formData.userEmail
      )

      // Step 2: Create initial encrypted medical history
      addStep('Creating encrypted medical history...')
      const initialData: MedicalHistoryData = {
        patientInfo: {
          createdAt: new Date().toISOString(),
          owner: pubkey,
          description: formData.description || `Medical records of ${formData.userName}`
        },
        medicalHistory: {
          conditions: [],
          medications: [],
          allergies: [],
          procedures: [],
          labResults: []
        },
        visits: [],
        notes: []
      }

      // Step 3: Commit encrypted data locally
      addStep('Committing encrypted data locally...')
      await commitEncrypted(
        dir,
        'medical-history.json',
        initialData,
        'Initial encrypted medical history',
        {
          name: formData.userName,
          email: formData.userEmail
        }
      )

      // Step 4: Tell server to create bare repository
      addStep('Creating repository on server...')
      await RepoService.createBareRepository(token, normalizedRepoName)

      // Step 5: Push encrypted commits to server
      addStep('Pushing encrypted data to server...')
      await pushToServer(dir, normalizedRepoName, token)

      // Success!
      addStep('✅ Repository created successfully!')
      setSuccess(`Repository "${normalizedRepoName}" created with end-to-end encryption!`)
      setShowCreateForm(false)
      setFormData({ 
        repoName: '', 
        userName: profile 
        ? ('pubkey' in profile 
            ? (profile.name || profile.display_name || '') 
            : (profile.username || profile.firstName || ''))
        : '',
        userEmail: (profile && 'email' in profile) ? profile.email : '',
        description: '' 
      })
      
      // Refresh repository list
      setTimeout(() => {
        loadRepositories()
        setCreationSteps([])
      }, 2000)

    } catch (err) {
      console.error('Repository creation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create repository')
      addStep(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
          <p className="text-muted-foreground">Manage your encrypted medical data repositories</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} disabled={creating}>
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
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Create Repository Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Create New Encrypted Medical Repository
            </CardTitle>
            <CardDescription>
              Your medical data will be encrypted with NIP-44 before being stored. 
              The server cannot read your data.
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
                  disabled={creating}
                />
              </div>
              
              <div>
                <Label htmlFor="userName">Your Name *</Label>
                <Input
                  id="userName"
                  placeholder="Jane Smith"
                  value={formData.userName}
                  onChange={(e) => setFormData(prev => ({ ...prev, userName: e.target.value }))}
                  disabled={creating}
                />
              </div>
              
              <div>
                <Label htmlFor="userEmail">Your Email *</Label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="jane@example.com"
                  value={formData.userEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, userEmail: e.target.value }))}
                  disabled={creating}
                />
              </div>

              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  placeholder="Personal medical records"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  disabled={creating}
                />
              </div>

              {/* Progress Steps */}
              {creationSteps.length > 0 && (
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <Label>Progress:</Label>
                  {creationSteps.map((step, index) => (
                    <div key={index} className="text-sm flex items-center gap-2">
                      {step.startsWith('✅') ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : step.startsWith('❌') ? (
                        <span className="text-red-600">✕</span>
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Create Encrypted Repository
                    </>
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowCreateForm(false)
                    setCreationSteps([])
                  }}
                  disabled={creating}
                >
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
          <CardDescription>
            All data is encrypted with your Nostr keys. The server cannot read your medical records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {repositories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No repositories found. Create your first encrypted repository above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {repositories.map((repo) => (
                <RepositoryCard key={repo.name} repository={repo} token={token} />
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

// Keep existing RepositoryCard component unchanged for now
// function RepositoryCard({ repository, token }: { repository: MedicalRepository; token: string }) {
//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle className="flex items-center gap-2">
//           <Lock className="h-5 w-5 text-green-600" />
//           <FolderOpen className="h-5 w-5" />
//           {repository.name}
//         </CardTitle>
//         <CardDescription>
//           <div>Created: {new Date(repository.created).toLocaleDateString()}</div>
//           <div>Access Level: {repository.access}</div>
//           {repository.description && <div>Description: {repository.description}</div>}
//           <div className="text-xs text-green-600 dark:text-green-400 mt-2">
//             🔒 Encrypted with NIP-44
//           </div>
//         </CardDescription>
//       </CardHeader>
//       <CardContent>
//         <p className="text-sm text-muted-foreground">
//           Repository management features coming soon...
//         </p>
//       </CardContent>
//     </Card>
//   )
// }