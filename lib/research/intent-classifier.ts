// lib/research/intent-classifier.ts — Intent/Subject Classification

import { ClassifiedIntent, SubjectType, IntentType } from './types'

// Common themes that should NOT require research — fictional, culinary, animals, objects, etc.
const COMMON_THEMES = [
  'nasi goreng', 'kucing', 'batu ajaib', 'pasar malam', 'petualangan di hutan',
  'anak menemukan benda misterius', 'a', 'arga', 'pontianak', 'batu', 'kucing',
  'anjing', 'naga', 'robot', 'alien', 'hutan', 'gunung', 'laut', 'desa', 'kota',
  'cinta', 'persahabatan', 'keluarga', 'misteri', 'horor', 'fantasi', 'petualangan'
]

const REAL_PERSON_INDICATORS = [
  'soekarno', 'sukarno', 'hatta', 'jokowi', 'prabowo', 'megawati', 'suharto',
  'habibie', 'gus dur', 'abdurrahman wahid', 'kartini', 'diponegoro', 'gajah mada',
  'einstein', 'newton', 'tesla', 'elon musk', 'steve jobs', 'bill gates',
  'sukarno', 'bung karno', 'bung hatta', 'ra kartini', 'cut nyak dien',
  'pattimura', 'imam bonjol', 'ki hajar dewantara', 'jenderal sudirman',
  'budi utomo', 'ahmad dahlan', 'hasyim asyari', 'wahid hasyim',
  'pramoedya', 'chairil anwar', 'w.s. rendra', 'sutan sjahrir',
  'tan malaka', 'agus salim', 'mohammad hatta', 'soeharto', 'joko widodo'
]

const REAL_PLACE_INDICATORS = [
  'jakarta', 'bandung', 'surabaya', 'yogyakarta', 'bali', 'borobudur', 'prambanan',
  'monas', 'komodo', 'raja ampat', 'danau toba', 'bromo', 'pontianak', 'medan',
  'makassar', 'palembang', 'semarang', 'malang', 'solo', 'denpasar'
]

const REAL_EVENT_INDICATORS = [
  'kemerdekaan indonesia', 'proklamasi', 'sumpah pemuda', 'g30s', 'reformasi 1998',
  'perang dunia', 'perang diponegoro', 'perang kemerdekaan', 'konferensi asia afrika',
  'tsunami aceh', 'gempa', 'pemilu'
]

const FACTUAL_REQUEST_PATTERNS = [
  /buat cerita tentang (.+) yang (benar|nyata|faktual|biografi|sejarah)/i,
  /cerita (biografi|faktual|nyata|sejarah) tentang/i,
  /kisah (nyata|hidup|biografi) (.+)/i,
  /biografi (.+)/i,
  /sejarah hidup (.+)/i,
  /ceritakan tentang (.+) secara faktual/i,
]

const FICTION_REQUEST_PATTERNS = [
  /cerita fiksi tentang (.+)/i,
  /fiksi yang terinspirasi dari (.+)/i,
  /bayangkan jika (.+)/i,
  /andaikan (.+)/i,
  /cerita khayalan tentang (.+)/i,
  /fanfic (.+)/i,
  /fiksi dengan tokoh (.+)/i,
]

function normalizeTheme(theme: string): string {
  return theme.toLowerCase().trim()
}

function isCommonTheme(theme: string): boolean {
  const norm = normalizeTheme(theme)
  if (norm.length <= 2) return true // "A" etc.
  if (COMMON_THEMES.some(ct => norm === ct || norm.includes(ct) || ct.includes(norm))) {
    // But check if it's actually a real person name that happens to contain common word
    // If theme is exactly common theme, it's common
    if (COMMON_THEMES.includes(norm)) return true
  }
  // Very short or generic fictional themes
  if (['nasi goreng', 'kucing', 'anjing', 'batu ajaib', 'pasar malam', 'petualangan', 'fantasi', 'misteri', 'horor', 'cinta'].includes(norm)) {
    return true
  }
  return false
}

function detectRealPerson(theme: string, storyIdea: string): boolean {
  const combined = `${theme} ${storyIdea}`.toLowerCase()
  // Check if theme itself looks like a person's name (2 words, capitalized, not common)
  // Real person usually has first + last name
  const words = theme.trim().split(/\s+/)
  // If theme is 1-3 words and contains known real person indicator
  if (REAL_PERSON_INDICATORS.some(ind => combined.includes(ind))) {
    return true
  }
  // Heuristic: if theme is 2-4 words, each word capitalized, not common, and storyIdea mentions biography/history
  const hasCapitalizedName = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+/.test(theme.trim())
  const hasBiographyContext = /(biografi|sejarah|tokoh nyata|presiden|pahlawan|ilmuwan|penemu|tokoh)/i.test(combined)
  if (hasCapitalizedName && hasBiographyContext) {
    return true
  }
  // If theme is a known person from our list and not common
  if (words.length >= 2 && words.length <= 4 && !isCommonTheme(theme)) {
    // Check if it looks like a person name (not place)
    const isPlace = REAL_PLACE_INDICATORS.some(p => normalizeTheme(theme).includes(p))
    if (!isPlace && theme.trim().length >= 5 && theme.trim().length <= 40) {
      // Could be real person - require further check via research planner
      // For now, if it has 2+ capitalized words and not common, mark as potential real person
      if (/^[A-Z]/.test(theme.trim()) && !/^(nasi|kucing|batu|pasar|petualangan|anak|seorang)/i.test(theme)) {
        // Ambiguous - but we will treat as potential real person to trigger research
        // Only if storyIdea suggests factual
        if (hasBiographyContext || /tentang/i.test(combined)) {
          return true
        }
      }
    }
  }
  return false
}

function detectRealPlace(theme: string): boolean {
  const norm = normalizeTheme(theme)
  return REAL_PLACE_INDICATORS.some(p => norm.includes(p) && norm.length < 30)
}

function detectRealEvent(theme: string, storyIdea: string): boolean {
  const combined = `${theme} ${storyIdea}`.toLowerCase()
  return REAL_EVENT_INDICATORS.some(e => combined.includes(e))
}

function detectIntent(theme: string, storyIdea: string): IntentType {
  const combined = `${theme} ${storyIdea}`.toLowerCase()
  
  if (FACTUAL_REQUEST_PATTERNS.some(p => p.test(combined))) {
    return 'FACTUAL_BIOGRAPHY'
  }
  if (FICTION_REQUEST_PATTERNS.some(p => p.test(combined))) {
    return 'FICTION_INSPIRED'
  }
  // If mentions real person and asks for story about them without saying fiction, default to factual for safety
  if (detectRealPerson(theme, storyIdea) && /tentang/i.test(combined)) {
    // Ambiguous but safer to treat as factual if no fiction indicator
    if (!/fiksi|khayalan|bayangkan|andaikan|fanfic/i.test(combined)) {
      return 'FACTUAL_BIOGRAPHY'
    }
    return 'AMBIGUOUS'
  }
  if (isCommonTheme(theme) || theme.trim().length <= 2) {
    return 'FICTIONAL_STORY'
  }
  return 'AMBIGUOUS'
}

export function classifyIntent(theme: string, storyIdea: string, genre?: string): ClassifiedIntent {
  const normalizedTheme = normalizeTheme(theme)
  const combined = `${theme} ${storyIdea} ${genre || ''}`.toLowerCase()

  // Fast path: common themes like Nasi goreng should NOT require research
  if (isCommonTheme(theme) || normalizedTheme.length <= 2) {
    return {
      subject: theme,
      subjectType: 'COMMON',
      intent: 'FICTIONAL_STORY',
      confidence: 0.95,
      requiresResearch: false,
      reason: `Tema "${theme}" terdeteksi sebagai COMMON/FICTIONAL (kuliner, hewan, benda, tema pendek, atau generik) — tidak memerlukan research. Contoh: Nasi goreng, Kucing, A, Arga, Batu ajaib, Pasar malam`,
      detectedRealSubject: false
    }
  }

  const isRealPerson = detectRealPerson(theme, storyIdea)
  const isRealPlace = detectRealPlace(theme)
  const isRealEvent = detectRealEvent(theme, storyIdea)

  let subjectType: SubjectType = 'UNKNOWN'
  let detectedRealSubject = false

  if (isRealPerson) {
    subjectType = 'REAL_PERSON'
    detectedRealSubject = true
  } else if (isRealEvent) {
    subjectType = 'REAL_EVENT'
    detectedRealSubject = true
  } else if (isRealPlace) {
    // Places like Pontianak alone are common unless story asks factual history
    if (/(sejarah|asal usul|fakta|biografi)/i.test(combined)) {
      subjectType = 'REAL_PLACE'
      detectedRealSubject = true
    } else {
      subjectType = 'COMMON'
    }
  } else {
    // Check if theme looks like a real person name (heuristic)
    const words = theme.trim().split(/\s+/)
    if (words.length >= 2 && words.length <= 4 && /^[A-Z]/.test(theme.trim()) && !isCommonTheme(theme)) {
      // Could be real person, treat as potential real subject for research
      // But only if confidence not too high to avoid false positives on fictional names
      const hasFactualContext = /(tokoh nyata|biografi|sejarah|presiden|pahlawan|ilmuwan|penemu|tentang)/i.test(combined)
      if (hasFactualContext) {
        subjectType = 'REAL_PERSON'
        detectedRealSubject = true
      } else {
        subjectType = 'FICTIONAL'
      }
    } else {
      subjectType = 'FICTIONAL'
    }
  }

  const intent = detectIntent(theme, storyIdea)
  const requiresResearch = detectedRealSubject && (intent === 'FACTUAL_BIOGRAPHY' || intent === 'AMBIGUOUS')

  return {
    subject: theme,
    subjectType,
    intent,
    confidence: detectedRealSubject ? 0.8 : 0.6,
    requiresResearch,
    reason: requiresResearch 
      ? `Tema "${theme}" terdeteksi sebagai ${subjectType} dengan intent ${intent} — WAJIB research sebelum generate. Detected real subject: ${detectedRealSubject}, Intent: ${intent}`
      : `Tema "${theme}" terdeteksi sebagai ${subjectType} dengan intent ${intent} — tidak wajib research. ${subjectType === 'COMMON' || subjectType === 'FICTIONAL' ? 'Tema fiksi/umum seperti Nasi goreng, Kucing, dll.' : 'Tidak ada indikasi subjek nyata yang memerlukan verifikasi faktual.'}`,
    detectedRealSubject
  }
}

// For testing
export function isCommonThemeForTest(theme: string): boolean {
  return isCommonTheme(theme)
}
