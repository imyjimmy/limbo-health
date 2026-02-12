# Medical Repository Structure - Requirements Document

## Overview

This document defines the structure and organization rules for patient-controlled medical repositories in Limbo Health. Each patient has a Git repository containing their complete medical history as encrypted JSON and markdown documents organized in a folder hierarchy.

## Design Principles

1. **Self-contained documents**: Each JSON file contains a complete, standalone markdown document in its `value` field
2. **Semantic organization**: Folder structure reflects logical medical record categories
3. **Client-side encryption**: All content is encrypted before reaching the Git server
4. **Granular sharing**: Folder and file-level permissions enable selective sharing
5. **Git-native**: Leverages standard Git operations for versioning, branching, and history

## Repository Structure

### Root Directory Layout

```
/
├── patient-info.json          # Basic demographics (required)
├── conditions/                # Chronic conditions and diagnoses
├── visits/                    # Doctor visits and consultations  
├── labs/                      # Laboratory test results
├── imaging/                   # Radiology and imaging reports
├── medications/               # Current and historical medications
├── allergies/                 # Known allergies and adverse reactions
├── immunizations/             # Vaccination records
├── procedures/                # Surgical and medical procedures
└── insurance/                 # Insurance and billing information
```

### Initialization

**Minimal initial repository:**
```json
// patient-info.json (only required file)
{
  "name": "John Doe",
  "dob": "1980-05-15",
  "gender": "M",
  "bloodType": "O+",
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "555-1234",
    "relationship": "Spouse"
  },
  "created": "2024-01-15T10:30:00Z"
}
```

All other directories and files are created on-demand as the patient adds records.

## File Format Specification

### Standard Document Structure

Every medical document follows this JSON schema:

```json
{
  "value": "# Document Title\n\nMarkdown content here...",
  "metadata": {
    "type": "visit|lab|condition|medication|etc",
    "created": "ISO 8601 timestamp",
    "updated": "ISO 8601 timestamp",
    "provider": "Provider name (optional)",
    "npi": "Provider NPI (optional)",
    "tags": ["tag1", "tag2"]
  },
  "children": []
}
```

### Field Definitions

**`value` (required, string)**
- Contains complete markdown document
- Must be valid markdown with proper heading hierarchy
- Should be human-readable when decrypted
- Can be empty string for new documents

**`metadata` (required, object)**
- Type-specific attributes for filtering and searching
- Always includes `type`, `created`, `updated`
- Provider information when applicable
- Free-form tags for user organization

**`children` (optional, array)**
- Array of objects following same schema
- Used for semantically dependent sub-documents
- See "Folder vs Children Rules" below

## Folder vs Children Decision Rules

### Use FOLDERS when:

1. **Independent entities**: Documents can exist meaningfully on their own
2. **Many similar items**: Collections of 3+ similar records (all visits, all labs)
3. **Peer relationships**: Items are siblings, not parent-child
4. **Filesystem operations**: Need to list, filter, or share groups of files
5. **Independent updates**: Documents change at different times

**Examples:**
```
visits/                        # Each visit is independent
├── 2023-05-15-annual-physical.json
├── 2023-08-20-follow-up.json
└── 2024-01-10-urgent-care.json

conditions/                    # Each condition stands alone
├── hypertension.json
├── diabetes.json
└── asthma.json

labs/2024/                     # Organized by date, many files
├── 01-16-lipid-panel.json
├── 02-22-cbc.json
└── 03-15-metabolic-panel.json
```

### Use CHILDREN when:

1. **Semantic dependency**: Child is meaningless without parent context
2. **Limited scope**: Small number (typically 1-5) of related items
3. **Atomic updates**: Parent and children often modified together
4. **Supplementary data**: Addendums, corrections, attachments to main document
5. **Hierarchical relationship**: Clear parent-child relationship, not peers

**Examples:**

```json
// visits/2023-05-15-annual-physical.json
{
  "value": "# Annual Physical - Dr. Smith\n\nDate: 2023-05-15...",
  "metadata": {
    "type": "visit",
    "provider": "Dr. Smith",
    "date": "2023-05-15"
  },
  "children": [
    {
      "value": "## Addendum - Lab results reviewed\n\nDate: 2023-05-17\n\nReviewed lipid panel...",
      "metadata": {
        "type": "addendum",
        "date": "2023-05-17"
      },
      "children": []
    },
    {
      "value": "## Patient follow-up call\n\nDate: 2023-05-20\n\nPatient called with questions...",
      "metadata": {
        "type": "follow_up_note",
        "date": "2023-05-20"
      },
      "children": []
    }
  ]
}
```

```json
// labs/2024-01-16-lipid-panel.json
{
  "value": "# Lipid Panel Results\n\nDate: 2024-01-16\n\n**Total Cholesterol:** 195 mg/dL...",
  "metadata": {
    "type": "lab",
    "test_date": "2024-01-16",
    "lab_name": "Quest Diagnostics"
  },
  "children": [
    {
      "value": "base64_encoded_pdf_scan_of_original_report",
      "metadata": {
        "type": "attachment",
        "format": "pdf",
        "encoding": "base64"
      },
      "children": []
    },
    {
      "value": "## Dr. Smith's Interpretation\n\nResults within normal range for patient's age...",
      "metadata": {
        "type": "doctor_note",
        "provider_npi": "1234567890",
        "date": "2024-01-17"
      },
      "children": []
    }
  ]
}
```

### Decision Tree

```
Is this a new piece of information?
│
├─ YES → Is it related to an existing document?
│         │
│         ├─ NO → Create new file in appropriate folder
│         │
│         └─ YES → Does it provide context/correction/addition to that document?
│                   │
│                   ├─ YES → Add as child
│                   │
│                   └─ NO → Create new file (they're peers)
│
└─ NO → Modifying existing document
          └─ Edit the markdown in the value field
```

## Common Patterns

### Pattern 1: Condition with Multiple Provider Notes

**Use nested folders + separate files:**

```
conditions/hypertension/
├── overview.json                           # Patient's summary
├── 2023-05-15-dr-smith-diagnosis.json     # Initial diagnosis
├── 2023-08-20-dr-jones-second-opinion.json # Different doctor
└── 2024-01-10-dr-wilson-consultation.json  # Another opinion
```

Each doctor's note is independent. Patient can share individual files or entire folder.

### Pattern 2: Lab Result with Supporting Documents

**Use children for attachments:**

```json
// labs/2024-01-16-lipid-panel.json
{
  "value": "# Lipid Panel\n\nResults summary...",
  "metadata": {...},
  "children": [
    {
      "value": "base64_pdf_data",
      "metadata": {"type": "pdf_attachment"}
    },
    {
      "value": "## Doctor's note\n\n...",
      "metadata": {"type": "interpretation"}
    }
  ]
}
```

The PDF and interpretation are meaningless without the lab result context.

### Pattern 3: Visit with Follow-up Actions

**Use children for related notes:**

```json
// visits/2024-01-15-annual-checkup.json
{
  "value": "# Annual Checkup\n\nPhysical examination findings...",
  "metadata": {...},
  "children": [
    {
      "value": "## Follow-up TODO\n\n- Schedule mammogram\n- Get flu shot...",
      "metadata": {"type": "action_items"}
    },
    {
      "value": "## Addendum - Lab results\n\nReceived labs, all normal...",
      "metadata": {"type": "addendum", "date": "2024-01-17"}
    }
  ]
}
```

Follow-ups and addendums are tightly coupled to the visit.

### Pattern 4: Medication with Refill History

**Separate files if tracking history matters:**

```
medications/
├── lisinopril-current.json
└── lisinopril-history/
    ├── 2023-05-15-initial.json
    ├── 2023-08-15-refill.json
    └── 2023-11-15-refill.json
```

**OR children if simple tracking:**

```json
// medications/lisinopril.json
{
  "value": "# Lisinopril 10mg\n\nDaily BP medication...",
  "metadata": {"status": "active"},
  "children": [
    {"value": "Prescribed 2023-05-15", "metadata": {"event": "initial"}},
    {"value": "Refilled 2023-08-15", "metadata": {"event": "refill"}},
    {"value": "Refilled 2023-11-15", "metadata": {"event": "refill"}}
  ]
}
```

## File Naming Conventions

### Standard Pattern
`YYYY-MM-DD-descriptive-name.json`

### Examples
- `2024-01-15-annual-physical.json`
- `2024-02-20-dr-jones-cardiology-consult.json`
- `2024-03-10-chest-xray-followup.json`

### Rules
- Always start with ISO date (YYYY-MM-DD) for chronological sorting
- Use lowercase with hyphens
- Be descriptive but concise
- Include provider name when relevant
- Use `.json` extension

## Technical Requirements

### Client-Side Operations

1. **Creating a new document:**
   ```javascript
   // 1. User creates "New Visit" in UI
   // 2. Generate filename: visits/2024-01-15-annual-physical.json
   // 3. Create JSON structure
   const doc = {
     value: "# Annual Physical\n\n",
     metadata: { type: "visit", created: new Date().toISOString() },
     children: []
   };
   // 4. Encrypt entire JSON
   const encrypted = await encryptNIP44(JSON.stringify(doc), userKey);
   // 5. Write to filesystem
   await fs.promises.mkdir('/repo/visits', { recursive: true });
   await fs.promises.writeFile('/repo/visits/2024-01-15-annual-physical.json', encrypted);
   // 6. Git add, commit, push
   ```

2. **Editing a document:**
   - User edits textarea (modifies `value` field)
   - Re-encrypt entire JSON
   - Commit with descriptive message

3. **Adding a child:**
   - Parse parent JSON
   - Push new object to `children` array
   - Re-encrypt and commit parent file

### Server-Side Requirements

- **Content-agnostic**: Server stores encrypted blobs, no parsing
- **Standard Git protocol**: No custom handlers needed
- **Metadata blind**: Server cannot read filenames, folder structure, or content
- **Zero-knowledge**: All encryption/decryption happens client-side

### Encryption Requirements

- All `.json` files encrypted with NIP-44 before Git operations
- File names and folder structure encrypted at transport layer
- Patient's Nostr keypair is encryption key
- No plaintext ever touches server storage

## Sharing and Permissions

### Folder-Level Sharing
```javascript
// Share entire conditions folder with new PCP
shareRepository({
  folders: ['conditions/'],
  recipient: doctorNpub,
  duration: '30days'
});
```

### File-Level Sharing
```javascript
// Share single visit with specialist
shareRepository({
  files: ['visits/2024-01-15-annual-physical.json'],
  recipient: specialistNpub,
  duration: '24hours'
});
```

### Child-Level Sharing
Children inherit parent permissions - cannot be shared independently. To share a child independently, promote it to a separate file.

## Validation Rules

### Required Elements
- Root `patient-info.json` must exist
- Every JSON file must have `value`, `metadata`, `children` fields
- `metadata` must include `type`, `created`

### Constraints
- `children` array can be empty but must exist
- `value` can be empty string but must exist
- Folder names must be lowercase, no spaces
- Dates in ISO 8601 format

### Prohibited
- No binary data in `value` field (use base64 in children)
- No deeply nested children (recommend max 2 levels)
- No circular references in document structure

## Migration Path

### From Existing Systems

1. Export data from source system
2. Parse into folder structure
3. Convert to JSON format
4. Patient reviews in UI
5. Encrypt and commit to new repo

### Adding Historical Records

- Use actual event dates in filenames and metadata
- Mark as `imported: true` in metadata
- Include source system in metadata

```json
{
  "value": "# Historical record imported from HealthSystem X...",
  "metadata": {
    "type": "visit",
    "created": "2020-05-15",
    "imported": true,
    "source": "HealthSystem X",
    "importDate": "2024-01-15"
  },
  "children": []
}
```

## Future Considerations

- **Attachments**: Large files (X-rays, PDFs) may use separate Git LFS or IPFS
- **Templates**: Pre-defined document structures for common record types
- **Smart tags**: Auto-tagging based on content analysis (client-side only)
- **Version control**: UI for viewing document history and diffs
- **Merge conflicts**: Resolution strategies for concurrent edits

---

**Document Version:** 1.0  
**Last Updated:** 2024-02-09  
**Status:** Draft for Review