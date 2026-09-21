// NEXUS — Asset Storage Abstraction & Versioning — asset_v001, asset_v002, no overwrite without explicit consent

export interface AssetMetadata {
  assetId: string;
  version: string; // asset_v001
  versionNumber: number;
  projectId: string;
  characterId?: string;
  sceneId?: string;
  jobId: string;
  requestId: string;
  imageUrl: string;
  rawImageUrl: string;
  thumbnailUrl?: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  prompt: string;
  negativePrompt: string;
  visualStyle: string;
  visualStyleModifier: string;
  gender: 'male' | 'female';
  genderTag: string;
  model: string;
  provider: string;
  spaceUsed: string;
  removeBgApplied: boolean;
  removeBgStatus: string;
  createdAt: string;
  updatedAt: string;
  isCanonical: boolean;
  previousVersion?: string;
  sourceOfTruth: {
    generationState: string;
    assetIdentity: string;
    projectIdentity: string;
    characterIdentity: string;
    providerConfiguration: string;
  };
}

class AssetStorage {
  private memoryStore: Map<string, AssetMetadata[]> = new Map();

  private getVersionString(num: number): string {
    return `asset_v${String(num).padStart(3, '0')}`;
  }

  // Create new version, never overwrite original without explicit consent
  createVersion(params: {
    projectId: string;
    characterId?: string;
    sceneId?: string;
    jobId: string;
    requestId: string;
    imageUrl: string;
    rawImageUrl: string;
    mimeType: string;
    width: number;
    height: number;
    size: number;
    prompt: string;
    negativePrompt: string;
    visualStyle: string;
    visualStyleModifier: string;
    gender: 'male' | 'female';
    genderTag: string;
    model: string;
    provider: string;
    spaceUsed: string;
    removeBgApplied: boolean;
    removeBgStatus: string;
  }): AssetMetadata {
    const key = params.characterId || params.sceneId || params.projectId;
    const existing = this.memoryStore.get(key) || [];
    const versionNumber = existing.length + 1;
    const version = this.getVersionString(versionNumber);
    const now = new Date().toISOString();

    const metadata: AssetMetadata = {
      assetId: `${key}_${version}_${Date.now()}`,
      version,
      versionNumber,
      projectId: params.projectId,
      characterId: params.characterId,
      sceneId: params.sceneId,
      jobId: params.jobId,
      requestId: params.requestId,
      imageUrl: params.imageUrl,
      rawImageUrl: params.rawImageUrl,
      thumbnailUrl: params.imageUrl,
      mimeType: params.mimeType,
      width: params.width,
      height: params.height,
      size: params.size,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      visualStyle: params.visualStyle,
      visualStyleModifier: params.visualStyleModifier,
      gender: params.gender,
      genderTag: params.genderTag,
      model: params.model,
      provider: params.provider,
      spaceUsed: params.spaceUsed,
      removeBgApplied: params.removeBgApplied,
      removeBgStatus: params.removeBgStatus,
      createdAt: now,
      updatedAt: now,
      isCanonical: versionNumber === 1, // first version is canonical by default
      previousVersion: existing.length > 0 ? existing[existing.length - 1].version : undefined,
      sourceOfTruth: {
        generationState: 'COMPLETED',
        assetIdentity: `${key}_${version}`,
        projectIdentity: params.projectId,
        characterIdentity: params.characterId || 'none',
        providerConfiguration: `${params.provider}:${params.spaceUsed}`,
      },
    };

    // Mark previous as non-canonical, new as canonical if it's latest? Actually keep first canonical unless explicitly changed
    // For simplicity, latest is not automatically canonical — user must approve
    // But we keep all versions

    existing.push(metadata);
    this.memoryStore.set(key, existing);

    console.log(`[AssetStorage] Created ${version} for ${key} — ${metadata.assetId} — canonical=${metadata.isCanonical}`);

    return metadata;
  }

  getVersions(key: string): AssetMetadata[] {
    return this.memoryStore.get(key) || [];
  }

  getLatest(key: string): AssetMetadata | null {
    const versions = this.getVersions(key);
    if (versions.length === 0) return null;
    return versions[versions.length - 1];
  }

  getCanonical(key: string): AssetMetadata | null {
    const versions = this.getVersions(key);
    const canonical = versions.find(v => v.isCanonical);
    return canonical || (versions.length > 0 ? versions[0] : null);
  }

  setCanonical(key: string, version: string): boolean {
    const versions = this.memoryStore.get(key);
    if (!versions) return false;
    
    let found = false;
    for (const v of versions) {
      if (v.version === version) {
        v.isCanonical = true;
        v.updatedAt = new Date().toISOString();
        found = true;
      } else {
        v.isCanonical = false;
      }
    }
    
    if (found) {
      console.log(`[AssetStorage] Set canonical ${version} for ${key}`);
    }
    
    return found;
  }

  // Explicit overwrite only with consent
  overwriteWithConsent(key: string, version: string, newImageUrl: string, consent: boolean): { ok: boolean; error?: string } {
    if (!consent) {
      return { ok: false, error: 'Overwrite requires explicit consent — use createVersion instead' };
    }
    
    const versions = this.memoryStore.get(key);
    if (!versions) {
      return { ok: false, error: `No asset found for ${key}` };
    }
    
    const target = versions.find(v => v.version === version);
    if (!target) {
      return { ok: false, error: `Version ${version} not found for ${key}` };
    }
    
    target.imageUrl = newImageUrl;
    target.updatedAt = new Date().toISOString();
    
    console.log(`[AssetStorage] Overwrote ${version} for ${key} with consent`);
    
    return { ok: true };
  }
}

export const assetStorage = new AssetStorage();
