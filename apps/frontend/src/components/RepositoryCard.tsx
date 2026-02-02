import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, FolderOpen, Lock, FileText, Save } from "lucide-react"
import { MedicalRepository } from '../types/repository'
import { 
  cloneFromServer, 
  readEncrypted, 
  commitEncrypted, 
  pushToServer,
  MedicalHistoryData,
  listLocalRepos,
  listRepoFiles,
  getCommitLog
} from '../lib/encryptedGit'
import { useAuth } from '../contexts/AuthContext'

export function RepositoryCard({ repository, token }: { repository: MedicalRepository; token: string }) {
  const { profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [medicalData, setMedicalData] = useState<MedicalHistoryData | null>(null)
  const [newNote, setNewNote] = useState('')
  const [localDir, setLocalDir] = useState<string | null>(null)

  const handleOpenRepository = async () => {
    setLoading(true)
    setError(null)

    try {
      const dir = `/${repository.name}`
      
      // Check if repo already exists locally
      const localRepos = await listLocalRepos()
      console.log('📁 Local repositories:', localRepos)
      
      let repoDir = dir
      
      if (!localRepos.includes(repository.name)) {
        // Clone from server
        console.log(`📥 Cloning ${repository.name} from server...`)
        repoDir = await cloneFromServer(repository.name, token)
        console.log(`✅ Cloned to ${repoDir}`)
      } else {
        console.log(`✅ Repository ${repository.name} already exists locally`)
      }
      
      // Read encrypted medical history
      console.log('🔓 Reading encrypted medical history...')
      const data = await readEncrypted(repoDir, 'medical-history.json')
      console.log('📋 Medical history:', data)
      
      const commits = await getCommitLog(dir)
      console.log('commits:', commits)
      
      setMedicalData(data)
      setLocalDir(repoDir)
      setIsOpen(true)
      
      // List actual files in repo
      const files = await listRepoFiles(repoDir);
      console.log('📁 Repository structure:');
      files.forEach(file => console.log(`  - ${file}`));
      
    } catch (err) {
      console.error('Failed to open repository:', err)
      setError(err instanceof Error ? err.message : 'Failed to open repository')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveNote = async () => {
    if (!newNote.trim()) {
      setError('Please enter a note')
      return
    }

    if (!medicalData || !localDir) {
      setError('Repository not loaded')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Add new note to medical history
      const updatedData: MedicalHistoryData = {
        ...medicalData,
        notes: [
          ...medicalData.notes,
          {
            id: `note-${Date.now()}`,
            timestamp: new Date().toISOString(),
            content: newNote,
            author: profile?.name || 'Patient'
          }
        ]
      }

      // Commit encrypted changes
      console.log('💾 Saving new note...')
      const sha = await commitEncrypted(
        localDir,
        'medical-history.json',
        updatedData,
        `Added note: ${newNote.substring(0, 50)}...`,
        {
          name: profile?.name || 'Patient',
          email: profile?.email || 'patient@example.com'
        }
      )
      console.log(`✅ Committed: ${sha}`)

      // Push to server
      console.log('🚀 Pushing to server...')
      await pushToServer(localDir, repository.name, token)
      console.log('✅ Pushed successfully')

      // Update local state
      setMedicalData(updatedData)
      setNewNote('')
      
      console.log('✅ Note saved and pushed!')
      
    } catch (err) {
      console.error('Failed to save note:', err)
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-green-600" />
          <FolderOpen className="h-5 w-5" />
          {repository.name}
        </CardTitle>
        <CardDescription>
          <div>Created: {new Date(repository.created).toLocaleDateString()}</div>
          <div>Access Level: {repository.access}</div>
          {repository.description && <div>Description: {repository.description}</div>}
          <div className="text-xs text-green-600 dark:text-green-400 mt-2">
            🔒 Encrypted with NIP-44
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!isOpen ? (
          <Button onClick={handleOpenRepository} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Opening Repository...
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4 mr-2" />
                Open Repository
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Show current notes count */}
            <div className="text-sm text-muted-foreground">
              <FileText className="h-4 w-4 inline mr-2" />
              {medicalData?.notes?.length || 0} notes in repository
            </div>

            {/* Add new note */}
            <div className="space-y-2">
              <Label htmlFor={`note-${repository.name}`}>Add New Note</Label>
              <Textarea
                id={`note-${repository.name}`}
                placeholder="Enter your medical notes here... (e.g., 'Had checkup today, blood pressure normal')"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={4}
                disabled={saving}
              />
            </div>

            <Button onClick={handleSaveNote} disabled={saving || !newNote.trim()}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving & Pushing...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Note (Encrypted)
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground">
              Note: Your note will be encrypted with NIP-44 before being committed and pushed to the server.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 
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
 */