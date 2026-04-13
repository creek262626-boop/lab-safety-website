import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  PackagePlus, PackageMinus, Settings, Download, Users, ShieldAlert, 
  CheckCircle, XCircle, Trash2, Database, ArrowRightLeft, LayoutDashboard, 
  LogOut, FlaskConical, ClipboardList, BarChart3, Lock, Filter, Info, History, AlertTriangle,
  Menu, X, ChevronDown, ChevronRight, Trophy, Cloud, WifiOff, Globe2, RotateCcw,
  Search, Edit2, Upload, FileSpreadsheet, User, Bell, Megaphone, Pin
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
/*
 * ⚠️ Firebase 보안 강화 안내 (Firestore Security Rules)
 * Firebase 콘솔 → Firestore → Rules 탭에서 아래 규칙으로 교체하세요:
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // 공개 읽기는 허용하되, 쓰기는 인증된 사용자만 허용
 *     match /artifacts/{appId}/public/data/{collection}/{docId} {
 *       allow read: if request.auth != null;  // 익명 인증 포함
 *       allow write: if request.auth != null;
 *     }
 *   }
 * }
 *
 * 위 규칙을 적용하면 Firebase 콘솔에서 발급한 익명 토큰 없이는
 * 직접 URL로 접근해도 데이터 읽기/쓰기가 불가합니다.
 * 추가 강화: Firebase Authentication → 로그인 제공업체에서
 * "익명" 만 활성화하고 나머지는 비활성화하세요.
 */
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, writeBatch, deleteField, getDocs, where, orderBy, limit, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

// 🔴 [보안 주의] Firebase 설정값이 클라이언트 번들에 포함됩니다.
// - Firebase API 키 자체는 공개 설계이나, Firestore Security Rules를 반드시 적용하세요.
// - webpack/Vite 등 번들러 환경에서는 .env 파일로 분리할 수 있습니다.
// - Firebase 콘솔 → Firestore → Rules 탭에서 파일 상단 주석의 Rules를 적용하세요.
const firebaseConfig = {
  apiKey: "AIzaSyDzBq5nl4P-KTISJOMDnqjcz9-4Bk3QbAU",
  authDomain: "metanol-c3990.firebaseapp.com",
  projectId: "metanol-c3990",
  storageBucket: "metanol-c3990.firebasestorage.app",
  messagingSenderId: "228520448694",
  appId: "1:228520448694:web:ae8e9f5bc8926a2243cc17",
  measurementId: "G-2Z7BDCB7V1"
};

// --- Helper Functions ---
// ✅ 브라우저 시간대에 관계없이 로컬 날짜 기준으로 일관되게 반환
// (서버 타임스탬프와 혼용 시 주의: processedAt 등은 serverTimestamp()로 대체 권장)
const getTodayString = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDateDaysAgoString = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 0));
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const HISTORY_DEFAULT_LOOKBACK_DAYS = 90;
const HISTORY_DEFAULT_LIMIT = 200;
const REQUESTS_RECENT_LOOKBACK_DAYS = 30;
const REQUESTS_RECENT_LIMIT = 250;
const REQUESTS_CACHE_TTL_MS = 60 * 1000;
const HISTORY_CACHE_TTL_MS = 60 * 1000;

const normalizeName = (name) => String(name || '').trim();

const QUICK_CHEMICAL_BUTTONS = [
    { label: 'Acetone (아세톤)', names: ['Acetone', '아세톤'] },
    { label: 'Acetonitrile (아세토니트릴)', names: ['Acetonitrile', '아세토니트릴'] },
    { label: 'Ethanol (에탄올)', names: ['Ethanol', '에탄올'] },
    { label: 'Ethyl Acetate (에틸아세테이트)', names: ['Ethyl Acetate', '에틸아세테이트'] },
    { label: 'Isopropyl alcohol (이소프로필알코올)', names: ['Isopropyl alcohol', '이소프로필알코올', 'IPA'] },
    { label: 'Methanol (메탄올)', names: ['Methanol', '메탄올'] },
    { label: 'n-Hexane (노말헥산)', names: ['n-Hexane', '노말헥산', 'Hexane'] },
];

const normalizeChemicalKey = (name) => String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();

const getQuickChemicalMeta = (value) => {
    const key = normalizeChemicalKey(value);
    if (!key) return null;
    return QUICK_CHEMICAL_BUTTONS.find(btn => [btn.label, ...btn.names].some(candidate => normalizeChemicalKey(candidate) === key)) || null;
};

const buildChemicalAliases = (chemicalName) => {
    const meta = getQuickChemicalMeta(chemicalName);
    return Array.from(new Set([chemicalName, meta?.label, ...(meta?.names || [])].filter(Boolean)));
};

const getPreferredChemicalLabel = (chemicalName) => {
    const meta = getQuickChemicalMeta(chemicalName);
    return meta?.label || chemicalName || '';
};

const matchesChemicalKeyword = (chemicalName, keyword) => {
    const needle = normalizeChemicalKey(keyword);
    if (!needle) return true;
    return buildChemicalAliases(chemicalName).some(alias => normalizeChemicalKey(alias).includes(needle));
};

const matchesShelfKeyword = (shelf, keyword) => {
    const normalizedShelf = normalizeChemicalKey(shelf).replace(/\s+/g, '');
    const normalizedKeyword = normalizeChemicalKey(keyword).replace(/\s+/g, '');
    return !normalizedKeyword || normalizedShelf.includes(normalizedKeyword);
};

const analyzeShelfAllocations = (value) => {
    const text = String(value || '').replace(/，/g, ',').trim();
    if (!text) return { allocations: [], invalidLines: [] };

    const allocations = [];
    const invalidLines = [];

    text
        .split(/\n|,/)
        .map(line => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const normalized = line.replace(/\s+/g, ' ').trim();
            let shelf = '';
            let amountText = '';

            if (normalized.includes(':')) {
                const parts = normalized.split(':');
                shelf = parts.shift().trim();
                amountText = parts.join(':').trim();
            } else if (normalized.includes('=')) {
                const parts = normalized.split('=');
                shelf = parts.shift().trim();
                amountText = parts.join('=').trim();
            } else {
                const parts = normalized.split(' ');
                amountText = parts.pop() || '';
                shelf = parts.join(' ').trim();
            }

            const amount = Number(String(amountText).replace(/[^0-9.]/g, ''));
            if (!shelf || !Number.isFinite(amount) || amount <= 0) {
                invalidLines.push(line);
                return;
            }
            allocations.push({ shelf, amount });
        });

    return { allocations, invalidLines };
};

// NOTE: serializeShelfAllocations helper was removed.
// 선반 분할 데이터는 shelfAllocationRows / shelfAllocations 구조로 직접 관리합니다.

const normalizeAllocationRows = (rows, fallbackShelf = '', fallbackAmount = '') => {
    if (Array.isArray(rows) && rows.length > 0) {
        return rows.map(row => ({
            shelf: String(row?.shelf || '').trim(),
            amount: row?.amount === 0 ? '0' : String(row?.amount || '').trim(),
        }));
    }
    return [{
        shelf: String(fallbackShelf || '').trim(),
        amount: fallbackAmount === 0 ? '0' : String(fallbackAmount || '').trim(),
    }];
};

const parseAllocationRows = (rows) => {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const allocations = [];
    const invalidRows = [];

    normalizedRows.forEach((row, index) => {
        const shelf = String(row?.shelf || '').trim();
        const rawAmount = String(row?.amount ?? '').trim();
        const hasValue = shelf || rawAmount;
        if (!hasValue) return;
        const amount = Number(rawAmount);
        if (!shelf || !Number.isFinite(amount) || amount <= 0) {
            invalidRows.push(index + 1);
            return;
        }
        allocations.push({ shelf, amount });
    });

    return { allocations, invalidRows };
};

const getEditableAllocationRows = (req) => {
    if (Array.isArray(req?.shelfAllocationRows) && req.shelfAllocationRows.length > 0) {
        return normalizeAllocationRows(req.shelfAllocationRows);
    }
    if (Array.isArray(req?.shelfAllocations) && req.shelfAllocations.length > 0) {
        return normalizeAllocationRows(req.shelfAllocations);
    }
    const legacy = analyzeShelfAllocations(req?.shelfAllocationText).allocations;
    if (legacy.length > 0) {
        return normalizeAllocationRows(legacy);
    }
    const fallbackShelf = req?.shelf === '미지정' ? '' : (req?.shelf || '');
    return normalizeAllocationRows([], fallbackShelf, req?.amount || '');
};

const getRequestedAllocations = (req) => {
    const rowResult = parseAllocationRows(req?.shelfAllocationRows);
    if (rowResult.allocations.length > 0 || rowResult.invalidRows.length > 0) {
        return rowResult;
    }
    if (Array.isArray(req?.shelfAllocations) && req.shelfAllocations.length > 0) {
        return { allocations: req.shelfAllocations, invalidRows: [] };
    }
    return analyzeShelfAllocations(req?.shelfAllocationText);
};

const getRequestShelfDisplay = (req) => {
    if (Array.isArray(req?.shelfAllocations) && req.shelfAllocations.length > 0) {
        return req.shelfAllocations.map(item => `${item.shelf}(${item.amount}${req.unit || 'L'})`).join(', ');
    }
    return req?.shelf || '미지정';
};

const buildHistoryEntriesFromRequest = (req, extraFields = {}) => {
    const fallbackAmount = Number(req?.amount);
    const rawAllocations = Array.isArray(req?.shelfAllocations) && req.shelfAllocations.length > 0
        ? req.shelfAllocations
        : [{ shelf: req?.shelf || '미지정', amount: fallbackAmount }];

    const normalizedAllocations = rawAllocations
        .map(item => ({
            shelf: String(item?.shelf || req?.shelf || '미지정').trim() || '미지정',
            amount: Number(item?.amount),
        }))
        .filter(item => Number.isFinite(item.amount) && item.amount > 0);

    const historyEntries = normalizedAllocations.length > 0
        ? normalizedAllocations
        : [{
            shelf: String(req?.shelf || '미지정').trim() || '미지정',
            amount: Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : 0,
        }];

    const historyGroupId = extraFields.historyGroupId || `${req?.id || 'REQ'}_${extraFields.processedAt || Date.now()}`;

    return historyEntries.map((allocation, index) => ({
        ...req,
        ...extraFields,
        id: extraFields.id || `${historyGroupId}_${index + 1}`,
        shelf: allocation.shelf,
        amount: allocation.amount,
        shelfAllocations: [{ shelf: allocation.shelf, amount: allocation.amount }],
        historyGroupId,
        splitHistoryIndex: index + 1,
        splitHistoryCount: historyEntries.length,
    }));
};


const expandHistoryEntries = (entries = []) => {
    if (!Array.isArray(entries)) return [];

    return entries.flatMap((entry, groupIndex) => {
        const rawAllocations = Array.isArray(entry?.shelfAllocations) && entry.shelfAllocations.length > 0
            ? entry.shelfAllocations
            : [{ shelf: entry?.shelf || '미지정', amount: Number(entry?.amount) }];

        const normalizedAllocations = rawAllocations
            .map((allocation) => ({
                shelf: String(allocation?.shelf || entry?.shelf || '미지정').trim() || '미지정',
                amount: Number(allocation?.amount),
            }))
            .filter((allocation) => Number.isFinite(allocation.amount) && allocation.amount > 0);

        if (normalizedAllocations.length === 0) {
            return [{
                ...entry,
                shelf: String(entry?.shelf || '미지정').trim() || '미지정',
                amount: Number(entry?.amount) || 0,
                splitHistoryIndex: entry?.splitHistoryIndex || 1,
                splitHistoryCount: entry?.splitHistoryCount || 1,
                historyRowExpanded: false,
            }];
        }

        const shouldExpand = normalizedAllocations.length > 1;
        const historyGroupId = entry?.historyGroupId || entry?.originalReqId || entry?.id || `history_${groupIndex}`;

        return normalizedAllocations.map((allocation, allocationIndex) => ({
            ...entry,
            id: shouldExpand ? `${entry?.id || historyGroupId}_${allocationIndex + 1}` : (entry?.id || `${historyGroupId}_${allocationIndex + 1}`),
            shelf: allocation.shelf,
            amount: allocation.amount,
            shelfAllocations: [{ shelf: allocation.shelf, amount: allocation.amount }],
            splitHistoryIndex: shouldExpand ? allocationIndex + 1 : (entry?.splitHistoryIndex || 1),
            splitHistoryCount: shouldExpand ? normalizedAllocations.length : (entry?.splitHistoryCount || 1),
            historyGroupId,
            historyRowExpanded: shouldExpand,
        }));
    });
};

const toEditableRequest = (req) => ({
    ...req,
    shelfAllocationRows: getEditableAllocationRows(req),
});


const HAZARD_TYPE_NORMALIZATION_MAP = {
    '특수인화물': '특수인화물',
    '1석유류비': '1석유류(비)',
    '1석유류수': '1석유류(수)',
    '알코올류': '알코올류',
    '2석유류비': '2석유류(비)',
    '2석유류수': '2석유류(수)',
    '3석유류비': '3석유류(비)',
    '3석유류수': '3석유류(수)',
    '4석유류': '4석유류',
    '동식물유': '동식물유',
    '특수가연물': '특수인화물',
    '유독물질': '유독물질',
    '산화성액체': '산화성액체',
    '해당없음': '해당없음',
    '비해당': '해당없음',
    '없음': '해당없음',
    'na': '해당없음',
    'n/a': '해당없음',
    '미지정': '미지정',
};

const normalizeChemicalType = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const compact = raw
        .replace(/[\s_]+/g, '')
        .replace(/[（\[]/g, '(')
        .replace(/[）\]]/g, ')')
        .replace(/\((비|수)\)/g, '$1')
        .replace(/[^가-힣a-zA-Z0-9/]/g, '')
        .toLowerCase();
    return HAZARD_TYPE_NORMALIZATION_MAP[compact] || raw;
};

const getResolvedChemicalType = (item, chemicalCatalog = []) => {
    const chemical = chemicalCatalog.find(c => normalizeChemicalKey(c.name) === normalizeChemicalKey(item?.chemicalName));
    return normalizeChemicalType(item?.chemType || item?.type || chemical?.type || '') || '미지정';
};

const getManufacturerName = (value) => typeof value === 'object'
    ? String(value?.name || '').trim()
    : String(value || '').trim();

const INVENTORY_EDIT_FIELD_LABELS = {
    storage: '저장소',
    labName: '실험실',
    shelf: '선반',
    chemicalName: '물질명',
    manufacturer: '제조사',
    chemType: '성상',
    amount: '수량',
    unit: '단위',
};

const getInventoryChangeSummary = (before = {}, after = {}) => {
    const normalizeValue = (key, value) => {
        if (key === 'amount') {
            const num = Number(value);
            return Number.isFinite(num) ? String(num) : '';
        }
        if (key === 'manufacturer') {
            return normalizeChemicalKey(getManufacturerName(value));
        }
        if (key === 'chemType') {
            return normalizeChemicalKey(normalizeChemicalType(value));
        }
        return normalizeChemicalKey(value);
    };

    return Object.entries(INVENTORY_EDIT_FIELD_LABELS)
        .filter(([key]) => normalizeValue(key, before?.[key]) !== normalizeValue(key, after?.[key]))
        .map(([, label]) => label);
};

const hasDuplicateInventoryRecord = (inventoryList, draft, currentId) => {
    const normalizedDraft = {
        storage: normalizeChemicalKey(draft?.storage),
        labName: normalizeChemicalKey(draft?.labName),
        shelf: normalizeChemicalKey(draft?.shelf || '미지정'),
        chemicalName: normalizeChemicalKey(draft?.chemicalName),
        manufacturer: normalizeChemicalKey(getManufacturerName(draft?.manufacturer)),
        unit: normalizeChemicalKey(draft?.unit || 'L'),
        chemType: normalizeChemicalKey(normalizeChemicalType(draft?.chemType || draft?.type || '미지정')),
    };

    return inventoryList.some((item) => item.id !== currentId && (
        normalizeChemicalKey(item.storage) === normalizedDraft.storage &&
        normalizeChemicalKey(item.labName) === normalizedDraft.labName &&
        normalizeChemicalKey(item.shelf || '미지정') === normalizedDraft.shelf &&
        normalizeChemicalKey(item.chemicalName) === normalizedDraft.chemicalName &&
        normalizeChemicalKey(getManufacturerName(item.manufacturer)) === normalizedDraft.manufacturer &&
        normalizeChemicalKey(item.unit || 'L') === normalizedDraft.unit &&
        normalizeChemicalKey(normalizeChemicalType(item.chemType || item.type || '미지정')) === normalizedDraft.chemType
    ));
};

const formatAdminDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// 병/캔 단위 표시 헬퍼 (연구원용)
const formatBottleDisplay = (amount, unit, bottleSize, bottleUnit, bottleCount, isAdmin = false) => {
    // 관리자는 항상 리터/원본 단위로 표시
    if (isAdmin) return `${amount}${unit || 'L'}`;
    // 병/캔 정보가 있을 때 연구자용 표시
    if (bottleSize > 0 && bottleUnit) {
        const cnt = (bottleCount && Number(bottleCount) > 0)
            ? Number(bottleCount)
            : Math.round(Number(amount) / bottleSize);
        if (cnt > 0) return `${cnt}${bottleUnit}(${amount}${unit && unit !== 'L' ? unit : 'L'})`;
    }
    return `${amount}${unit || 'L'}`;
};

const downloadCSV = (content, filename) => {
    // ✅ Blob 방식으로 교체 (대용량 파일에서 encodeURI URL 길이 제한 문제 해결)
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};


const csvEscapeText = (value) => {
    const normalized = String(value ?? '-').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    return `"${normalized}"`;
};

const csvEscapeExcelText = (value) => {
    const normalized = String(value ?? '-').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    return `="${normalized}"`;
};

const csvEscapeNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : '';
};

const EXPLANATION_COPY = {
    en: {
        label: 'English',
        title: 'Quick guide for international students',
        body: '1) Select storage and lab. 2) Search a chemical in English or Korean, or use a quick button. 3) Enter planned date and quantity. 4) Submit the request and check the status in My Requests.'
    },
    zh: {
        label: '中文',
        title: '留学生快速说明',
        body: '1）先选择储存地点和实验室。2）可用英文或韩文搜索物质，也可直接点击常用快捷按钮。3）填写计划日期和数量。4）提交后可在“申请现况”中查看进度。'
    }
};

// --- CSV/Excel 파싱 헬퍼 ---
const parseFileToRows = (file) => {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      // SheetJS를 동적으로 로드
      if (window.XLSX) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = window.XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            resolve(rows.slice(1).filter(r => r.some(c => String(c).trim())));
          } catch(err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // SheetJS 로드
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.onload = () => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const wb = window.XLSX.read(e.target.result, { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
              resolve(rows.slice(1).filter(r => r.some(c => String(c).trim())));
            } catch(err) { reject(err); }
          };
          reader.readAsArrayBuffer(file);
        };
        script.onerror = () => reject(new Error('SheetJS 로드 실패'));
        document.head.appendChild(script);
      }
    } else {
      // CSV: UTF-8 먼저 시도, 실패시 EUC-KR
      const tryRead = (encoding) => {
        return new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(1);
            const rows = lines.map(line => {
              // 큰따옴표로 감싼 필드 처리
              const result = [];
              let cur = '', inQ = false;
              for (let i = 0; i < line.length; i++) {
                if (line[i] === '"') { inQ = !inQ; }
                else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
                else { cur += line[i]; }
              }
              result.push(cur.trim());
              return result;
            });
            res(rows.filter(r => r.some(c => c)));
          };
          reader.onerror = rej;
          reader.readAsText(file, encoding);
        });
      };
      tryRead('UTF-8').then(rows => {
        // 한글 깨짐 감지: 주요 문자가 깨졌는지 체크
        const flat = rows.flat().join('');
        const hasGarbled = /\ufffd|\u00ef\u00bb\u00bf/.test(flat) || 
                           // ✅ 중복 조건 제거: 한글 없고 non-ASCII 있으면 깨진 것으로 판단
                           (flat.length > 0 && /[\x80-\xff]/.test(flat) && !/[가-힣]/.test(flat));
        if (hasGarbled) {
          tryRead('EUC-KR').then(resolve).catch(() => resolve(rows));
        } else {
          resolve(rows);
        }
      }).catch(() => tryRead('EUC-KR').then(resolve).catch(reject));
    }
  });
};

// --- 위험물 지정수량 기준 ---
const DESIGNATED_QTY = {
    '특수인화물': 50,
    '1석유류(비)': 200,
    '1석유류(수)': 400,
    '알코올류': 400,
    '2석유류(비)': 1000,
    '2석유류(수)': 2000,
    '3석유류(비)': 2000,
    '3석유류(수)': 4000,
    '4석유류': 6000,
    '동식물유': 10000,
    '유독물질': 0,
    '해당없음': 0
};

// --- 허가량 데이터 ---
const LICENSED_SPECS = {
    '제1과학기술관': {
        '특수인화물': 200, '1석유류(비)': 1000, '1석유류(수)': 1000, '알코올류': 2600,
        '2석유류(비)': 1200, '2석유류(수)': 200, '3석유류(비)': 600, '3석유류(수)': 600,
        '4석유류': 600, '동식물유': 600, '유독물질': 0, '해당없음': 0
    },
    '제1공학관': { 
        '특수인화물': 200, '1석유류(비)': 1000, '1석유류(수)': 1000, '알코올류': 2500,
        '2석유류(비)': 500, '2석유류(수)': 500, '3석유류(비)': 500, '3석유류(수)': 500,
        '4석유류': 500, '동식물유': 500, '유독물질': 0, '해당없음': 0
    },
    '동물실험동': { 
        '특수인화물': 200, '1석유류(비)': 1000, '1석유류(수)': 1000, '알코올류': 2500,
        '2석유류(비)': 1500, '2석유류(수)': 500, '3석유류(비)': 100, '3석유류(수)': 100,
        '4석유류': 100, '동식물유': 100, '유독물질': 0, '해당없음': 0
    }
};

// --- 초기 시딩 데이터 ---
const SEED_LABS = [
  { name: '사회교육원 행정팀', loc: '골프연습장', ext: '5845', storage: '제1과학기술관' },
];

const SEED_CHEMICALS = [
  { cas: '67-64-1', name: 'Acetone', type: '1석유류(수)' },
];

const SEED_MANUFACTURERS = [
    { name: '삼전순약공업' }
];


// ──────────────────────────────────────────────────────────
// 자필 서명 패드 컴포넌트
// ──────────────────────────────────────────────────────────
const SignaturePad = ({ onSave, onClear, resetKey }) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  }, [onClear]);

  // resetKey 변경 시 캔버스 초기화
  useEffect(() => {
    clearCanvas();
  }, [resetKey, clearCanvas]); // ✅ clearCanvas를 의존성 배열에 추가 (lint 경고 해소)

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const pos = getPos(e);
      lastPosRef.current = pos;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      lastPosRef.current = pos;
    };

    const endDraw = (e) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      onSave(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', endDraw);

    return () => {
      canvas.removeEventListener('mousedown', startDraw);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', endDraw);
      canvas.removeEventListener('mouseleave', endDraw);
      canvas.removeEventListener('touchstart', startDraw);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', endDraw);
    };
  }, [onSave, onClear]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white shadow-inner overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={140}
          className="w-full touch-none block"
          style={{ cursor: 'crosshair', display: 'block', backgroundColor: '#ffffff' }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-slate-400 text-sm font-medium">이 곳에 서명하세요 ✍️</span>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={clearCanvas}
          className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition"
        >
          <span>↺</span> 서명 초기화
        </button>
      </div>
    </div>
  );
};

export default function App() {
  // --- States ---
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [appId] = useState('lab-safety-v1');
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);

  const [currentUser, setCurrentUser] = useState(null); 
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [labs, setLabs] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);

  const [historyFilter, setHistoryFilter] = useState({ startDate: getDateDaysAgoString(HISTORY_DEFAULT_LOOKBACK_DAYS), endDate: '', storage: 'All', type: 'All' });
  const [selectedChemDetail, setSelectedChemDetail] = useState(null); 
  const [selectedLabDetail, setSelectedLabDetail] = useState(null); 
  const [masterSubTab, setMasterSubTab] = useState('labs'); 
  const [dashboardTab, setDashboardTab] = useState('제1과학기술관');

  const [masterAddModal, setMasterAddModal] = useState({ isOpen: false, type: '' });
  const [newLabData, setNewLabData] = useState({ name: '', loc: '', ext: '', storage: '제1공학관' });
  const [newChemData, setNewChemData] = useState({ cas: '', name: '', type: '1석유류(비)' });
  const [newManufacturer, setNewManufacturer] = useState('');

  const [requestForm, setRequestForm] = useState({ type: 'IN', actionDate: getTodayString(), labName: '', storage: '', ext: '', chemicalName: '', amount: '', unit: 'L', manufacturer: '', bottleSize: 0, bottleUnit: '', bottleCount: '', directSize: '', directUnit: '병', directCount: '' });
  const [expandedStats, setExpandedStats] = useState({});
  const [isChemDropdownOpen, setIsChemDropdownOpen] = useState(false);
  const [isEditChemDropdownOpen, setIsEditChemDropdownOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null); // 승인화면 편집 모달용
  const [bulkImportModal, setBulkImportModal] = useState(false); // 반출입 일괄 등록 모달
  const [bulkImportRows, setBulkImportRows] = useState([]); // 파싱된 일괄 등록 행
  const [bulkImportErrors, setBulkImportErrors] = useState([]); // 유효성 검사 오류

  // ── 공지사항 상태 ──
  const [notices, setNotices] = useState([]);
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', important: false });

  // ── 승인 탭 상태 (훅 위반 수정: renderApprovalScreen 내부에서 이동) ──
  const [approvalViewTab, setApprovalViewTab] = useState('pending');
  const [uiLang, setUiLang] = useState('en');

  const [invFilter, setInvFilter] = useState({ storage: 'All', labName: 'All', manufacturer: 'All', chemicalName: '', chemType: 'All' }); // 재고 현황 조회 필터
  const [invSort, setInvSort] = useState({ key: 'storage', dir: 'asc' }); // 재고 현황 정렬
  const [invEditModal, setInvEditModal] = useState(null); // 재고 병/캔 단위 편집 모달
  const [inventoryEditModal, setInventoryEditModal] = useState(null); // 재고 기본 정보 수정 모달
  const [inventoryAdjustModal, setInventoryAdjustModal] = useState(null); // 재고 불일치 즉시 보정 모달
  const [invExportIncludeSummary, setInvExportIncludeSummary] = useState(true); // CSV 요약 포함 여부
  // ✅ 물질명 검색 debounce: 매 키 입력마다 전체 배열 순회를 방지
  const [chemNameDebounced, setChemNameDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setChemNameDebounced(invFilter.chemicalName), 200);
    return () => clearTimeout(timer);
  }, [invFilter.chemicalName]);
  const legacyCleanupRef = useRef({ requests: 'idle', history: 'idle' });
  const requestFetchMetaRef = useRef({ scope: '', fetchedAt: 0 });
  const historyFetchMetaRef = useRef({ scope: '', fetchedAt: 0 });
  const adminActivityRef = useRef(Date.now());
  const staticDataLoadedRef = useRef(false);
  const noticesLoadedRef = useRef(false);
  const [isRealtimePaused, setIsRealtimePaused] = useState(false);
  const [networkState, setNetworkState] = useState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online');
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const shouldLockScroll = Boolean(
      inventoryEditModal ||
      inventoryAdjustModal ||
      invEditModal ||
      selectedLabDetail ||
      editingRequest ||
      modal.isOpen ||
      showPasswordModal ||
      bulkImportModal ||
      masterAddModal.isOpen ||
      selectedChemDetail
    );
    if (!shouldLockScroll) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [bulkImportModal, editingRequest, invEditModal, inventoryAdjustModal, inventoryEditModal, masterAddModal.isOpen, modal.isOpen, selectedChemDetail, selectedLabDetail, showPasswordModal]);

  const stripSensitiveRequestFields = useCallback((item) => {
    if (!item) return item;
    const { signature, requestorName, ...rest } = item;
    return rest;
  }, []);

  const findChemicalByAnyName = useCallback((value) => {
    const key = normalizeChemicalKey(value);
    if (!key) return null;
    return chemicals.find((chemical) => buildChemicalAliases(chemical.name).some(alias => normalizeChemicalKey(alias) === key)) || null;
  }, [chemicals]);

  const requestStatusSummary = useMemo(() => {
    const summary = { pendingReqs: [], approvedCount: 0, rejectedCount: 0 };
    requests.forEach((req) => {
      if (req?.status === 'PENDING') summary.pendingReqs.push(req);
      else if (req?.status === 'APPROVED') summary.approvedCount += 1;
      else if (req?.status === 'REJECTED') summary.rejectedCount += 1;
    });
    return {
      ...summary,
      pendingCount: summary.pendingReqs.length,
    };
  }, [requests]);

  const chemicalInfoMap = useMemo(() => new Map(chemicals.map((chemical) => [String(chemical?.name || ''), chemical])), [chemicals]);

  const expandedHistoryEntries = useMemo(() => expandHistoryEntries(history)
    .filter((entry) => entry.status !== 'REJECTED')
    .sort((a, b) => {
      const dateCompare = String(b.actionDate || '').localeCompare(String(a.actionDate || ''));
      if (dateCompare !== 0) return dateCompare;
      return (Number(b.processedAt) || 0) - (Number(a.processedAt) || 0);
    }), [history]);

  const historyStorageOptions = useMemo(() => Array.from(new Set(history.map((item) => item.storage).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [history]);

  const publicStatusStorageOptions = useMemo(() => Array.from(new Set(inventory.map((item) => item.storage).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [inventory]);

  const getSuggestedShelves = useCallback((storage, labName, keyword = '') => {
    if (!storage || !labName) return [];
    const pool = inventory
      .filter(item => item.storage === storage && item.labName === labName && item.shelf && item.shelf !== '미지정')
      .map(item => String(item.shelf).trim())
      .filter(Boolean);

    return Array.from(new Set(pool))
      .filter(shelf => matchesShelfKeyword(shelf, keyword))
      .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  }, [inventory]);

  const cleanupLegacyPersonalFields = useCallback(async (collectionName, items) => {
    if (isDemoMode || !db || !user) return;

    const cleanupState = legacyCleanupRef.current[collectionName];
    if (cleanupState === 'running' || cleanupState === 'done') return;

    const targets = items.filter(item => item.signature !== undefined || item.requestorName !== undefined);
    if (targets.length === 0) {
      legacyCleanupRef.current[collectionName] = 'done';
      return;
    }

    legacyCleanupRef.current[collectionName] = 'running';
    try {
      for (let i = 0; i < targets.length; i += 400) {
        const batch = writeBatch(db);
        targets.slice(i, i + 400).forEach((item) => {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', collectionName, item.id);
          batch.update(docRef, { signature: deleteField(), requestorName: deleteField() });
        });
        await batch.commit();
      }
    } catch (error) {
      legacyCleanupRef.current[collectionName] = 'idle';
      console.error(`[민감정보 정리 실패] ${collectionName}`, error);
      return;
    }

    legacyCleanupRef.current[collectionName] = 'done';
  }, [appId, db, isDemoMode, user]);

  // --- 1. Firebase Setup ---
  useEffect(() => {
    const startDemoMode = () => {
        console.log("ℹ️ 데모 모드로 전환합니다.");
        setIsDemoMode(true);
        setFirebaseInitialized(true);
        setLabs(SEED_LABS.map((l, i) => ({ id: String(i), ...l })));
        setChemicals(SEED_CHEMICALS.map((c, i) => ({ id: String(i), ...c })));
        setManufacturers(SEED_MANUFACTURERS.map((m, i) => ({ id: String(i), name: m.name })));
    };

    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("여기에_API_KEY")) {
        startDemoMode();
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);

        enableMultiTabIndexedDbPersistence(dbInstance).catch((error) => {
            if (!['failed-precondition', 'unimplemented'].includes(error?.code)) {
                console.warn('⚠️ Firestore 오프라인 캐시 설정 실패:', error);
            }
        });

        setAuth(authInstance);
        setDb(dbInstance);

        signInAnonymously(authInstance)
            .then(() => console.log("✅ Firebase 연결 성공"))
            .catch((error) => {
                console.warn("⚠️ 서버 연결 실패 (데모 모드 실행):", error.code);
                startDemoMode();
            });

        const unsubscribe = onAuthStateChanged(authInstance, (u) => {
            if (u) {
                setUser(u);
                setFirebaseInitialized(true);
                setIsDemoMode(false);
            }
        });
        return () => unsubscribe();
    } catch (error) {
        console.error("⚠️ Firebase 초기화 오류:", error);
        startDemoMode();
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;

    const updateVisibility = () => setIsRealtimePaused(document.hidden);
    const handleOnline = () => setNetworkState('online');
    const handleOffline = () => setNetworkState('offline');

    updateVisibility();
    setNetworkState(window.navigator?.onLine === false ? 'offline' : 'online');

    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const markDataSynced = useCallback(() => setLastSyncAt(Date.now()), []);
  const formatSyncTime = useCallback((value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, []);
  const sortNoticeItems = useCallback((items) => [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), []);
  const sortLabsByName = useCallback((items) => [...items].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true })), []);
  const sortChemicalsByName = useCallback((items) => [...items].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true })), []);
  const normalizeManufacturerItems = useCallback((items) => items
    .map((item) => ({ id: item.id, name: getManufacturerName(item.name) }))
    .filter((item) => item.name)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })), []);

  const loadNoticesOnce = useCallback(async ({ force = false } = {}) => {
    if (isDemoMode || !user || !db || networkState === 'offline') return;
    if (noticesLoadedRef.current && !force) return;
    try {
      const noticesRef = collection(db, 'artifacts', appId, 'public', 'data', 'notices');
      const snapshot = await getDocs(noticesRef);
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      setNotices(sortNoticeItems(data));
      noticesLoadedRef.current = true;
      markDataSynced();
    } catch (error) {
      console.error('공지사항 1회 로드 실패', error);
    }
  }, [appId, db, isDemoMode, markDataSynced, networkState, sortNoticeItems, user]);

  const loadStaticReferenceData = useCallback(async ({ force = false } = {}) => {
    if (isDemoMode || !user || !db || !currentUser || networkState === 'offline') return;
    if (staticDataLoadedRef.current && !force) return;

    const labsRef = collection(db, 'artifacts', appId, 'public', 'data', 'labs');
    const chemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'chemicals');
    const manufRef = collection(db, 'artifacts', appId, 'public', 'data', 'manufacturers');

    const readCollectionOnce = async (ref, seedData = []) => {
      let snapshot = await getDocs(ref);
      let data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      if (data.length === 0 && seedData.length > 0 && !snapshot.metadata.fromCache) {
        const batch = writeBatch(db);
        seedData.forEach(item => batch.set(doc(ref), item));
        await batch.commit();
        snapshot = await getDocs(ref);
        data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      }
      return data;
    };

    try {
      const [labsData, chemicalsData, manufacturersData] = await Promise.all([
        readCollectionOnce(labsRef, SEED_LABS),
        readCollectionOnce(chemsRef, SEED_CHEMICALS),
        readCollectionOnce(manufRef, SEED_MANUFACTURERS),
      ]);

      setLabs(sortLabsByName(labsData));
      setChemicals(sortChemicalsByName(chemicalsData));
      setManufacturers(normalizeManufacturerItems(manufacturersData));
      staticDataLoadedRef.current = true;
      markDataSynced();
    } catch (error) {
      console.error('기초 데이터 1회 로드 실패', error);
    }
  }, [appId, currentUser, db, isDemoMode, markDataSynced, networkState, normalizeManufacturerItems, sortChemicalsByName, sortLabsByName, user]);

  const mergeAndSortRequests = useCallback((groups) => {
    const merged = new Map();
    groups.flat().forEach((item) => {
      if (!item?.id) return;
      merged.set(String(item.id), stripSensitiveRequestFields(item));
    });
    return [...merged.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [stripSensitiveRequestFields]);

  const loadRequestsOnce = useCallback(async ({ force = false, includeRecent = true } = {}) => {
    if (isDemoMode || !user || !db || !currentUser || networkState === 'offline') return;

    const scope = `${currentUser}:requests:${REQUESTS_RECENT_LOOKBACK_DAYS}:${includeRecent ? 'recent' : 'pendingOnly'}`;
    if (!force && requestFetchMetaRef.current.scope === scope && (Date.now() - requestFetchMetaRef.current.fetchedAt) < REQUESTS_CACHE_TTL_MS) return;

    setIsRequestsLoading(true);
    try {
      const reqRef = collection(db, 'artifacts', appId, 'public', 'data', 'requests');
      const pendingSnapshotPromise = getDocs(query(reqRef, where('status', '==', 'PENDING')));
      let pendingData = [];
      let recentData = [];

      if (includeRecent) {
        const recentCutoff = Date.now() - (REQUESTS_RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const [pendingSnapshot, recentSnapshot] = await Promise.all([
          pendingSnapshotPromise,
          getDocs(query(reqRef, where('createdAt', '>=', recentCutoff), orderBy('createdAt', 'desc'), limit(REQUESTS_RECENT_LIMIT))),
        ]);
        pendingData = pendingSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        recentData = recentSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      } else {
        const pendingSnapshot = await pendingSnapshotPromise;
        pendingData = pendingSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      }

      cleanupLegacyPersonalFields('requests', [...pendingData, ...recentData]);
      setRequests((prev) => {
        const preservedRecent = includeRecent ? recentData : prev.filter((item) => item.status !== 'PENDING');
        return mergeAndSortRequests([pendingData, preservedRecent]);
      });
      requestFetchMetaRef.current = { scope, fetchedAt: Date.now() };
      markDataSynced();
    } catch (error) {
      console.error('신청 목록 1회 로드 실패', error);
    } finally {
      setIsRequestsLoading(false);
    }
  }, [appId, cleanupLegacyPersonalFields, currentUser, db, isDemoMode, markDataSynced, mergeAndSortRequests, networkState, user]);

  const loadHistoryOnce = useCallback(async ({ force = false } = {}) => {
    if (isDemoMode || !user || !db || currentUser !== 'admin' || networkState === 'offline') return;

    const scope = JSON.stringify({ startDate: historyFilter.startDate || '', endDate: historyFilter.endDate || '' });
    if (!force && historyFetchMetaRef.current.scope === scope && (Date.now() - historyFetchMetaRef.current.fetchedAt) < HISTORY_CACHE_TTL_MS) return;

    setIsHistoryLoading(true);
    try {
      const constraints = [];
      if (historyFilter.startDate) {
        const startMs = new Date(`${historyFilter.startDate}T00:00:00`).getTime();
        if (Number.isFinite(startMs)) constraints.push(where('processedAt', '>=', startMs));
      }
      if (historyFilter.endDate) {
        const endMs = new Date(`${historyFilter.endDate}T23:59:59.999`).getTime();
        if (Number.isFinite(endMs)) constraints.push(where('processedAt', '<=', endMs));
      }
      constraints.push(orderBy('processedAt', 'desc'));
      constraints.push(limit(HISTORY_DEFAULT_LIMIT));

      const histRef = query(collection(db, 'artifacts', appId, 'public', 'data', 'history'), ...constraints);
      const snapshot = await getDocs(histRef);
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      cleanupLegacyPersonalFields('history', data);
      setHistory(data.map(stripSensitiveRequestFields).sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0)));
      historyFetchMetaRef.current = { scope, fetchedAt: Date.now() };
      markDataSynced();
    } catch (error) {
      console.error('기록 1회 로드 실패', error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [appId, cleanupLegacyPersonalFields, currentUser, db, historyFilter.endDate, historyFilter.startDate, isDemoMode, markDataSynced, networkState, stripSensitiveRequestFields, user]);

  // --- 2. Data Sync Effects ---
  useEffect(() => {
    loadNoticesOnce();
  }, [loadNoticesOnce]);

  useEffect(() => {
    if (!currentUser) return;
    loadStaticReferenceData();
  }, [currentUser, loadStaticReferenceData]);

  useEffect(() => {
    if (isDemoMode || !user || !db || currentUser !== 'admin' || activeTab !== 'notices') return;
    if (networkState === 'offline' || isRealtimePaused) return;

    const noticesRef = collection(db, 'artifacts', appId, 'public', 'data', 'notices');
    const unsubNotices = onSnapshot(noticesRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      setNotices(sortNoticeItems(data));
      noticesLoadedRef.current = true;
      markDataSynced();
    });

    return () => unsubNotices();
  }, [activeTab, appId, currentUser, db, isDemoMode, isRealtimePaused, markDataSynced, networkState, sortNoticeItems, user]);

  const shouldRealtimeRequests = currentUser === 'admin' && ['approvals', 'dashboard'].includes(activeTab);
  const shouldIncludeRecentRequests = activeTab === 'my_requests' || (currentUser === 'admin' && activeTab === 'approvals' && approvalViewTab === 'all');

  useEffect(() => {
    if (isDemoMode || !user || !db) return;

    if (!currentUser) {
      setInventory([]);
      setRequests([]);
      setHistory([]);
      requestFetchMetaRef.current = { scope: '', fetchedAt: 0 };
      historyFetchMetaRef.current = { scope: '', fetchedAt: 0 };
      return;
    }

    if (networkState === 'offline' || isRealtimePaused) return;

    if (!shouldRealtimeRequests && activeTab === 'my_requests') {
      loadRequestsOnce({ includeRecent: true });
    }

    if (!shouldRealtimeRequests) return;

    loadRequestsOnce({ includeRecent: shouldIncludeRecentRequests });
    const reqRef = query(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), where('status', '==', 'PENDING'));
    const unsubReq = onSnapshot(reqRef, (snapshot) => {
      const pendingData = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      cleanupLegacyPersonalFields('requests', pendingData);
      setRequests(prev => mergeAndSortRequests([pendingData, prev.filter(item => item.status !== 'PENDING')]));
      requestFetchMetaRef.current = { scope: `${currentUser}:requests:${REQUESTS_RECENT_LOOKBACK_DAYS}`, fetchedAt: Date.now() };
      markDataSynced();
    });

    return () => unsubReq();
  }, [activeTab, appId, approvalViewTab, cleanupLegacyPersonalFields, currentUser, db, isDemoMode, isRealtimePaused, loadRequestsOnce, markDataSynced, mergeAndSortRequests, networkState, shouldIncludeRecentRequests, shouldRealtimeRequests, user]);

  const shouldSubscribeInventory = currentUser === 'admin'
    ? ['dashboard', 'admin_inventory', 'approvals'].includes(activeTab)
    : ['request', 'public_status', 'safety_status'].includes(activeTab);

  useEffect(() => {
    if (isDemoMode || !user || !db || !currentUser) return;
    if (!shouldSubscribeInventory) return;
    if (networkState === 'offline' || isRealtimePaused) return;

    const invRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const unsubInv = onSnapshot(invRef, (snapshot) => {
      setInventory(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
      markDataSynced();
    });

    return () => unsubInv();
  }, [activeTab, appId, currentUser, db, isDemoMode, isRealtimePaused, markDataSynced, networkState, shouldSubscribeInventory, user]);

  useEffect(() => {
    if (isDemoMode || !user || !db || currentUser !== 'admin' || activeTab !== 'history') return;
    if (networkState === 'offline' || isRealtimePaused) return;
    loadHistoryOnce();
  }, [activeTab, currentUser, db, isDemoMode, isRealtimePaused, loadHistoryOnce, networkState, user]);

  // --- Logic Helpers ---
  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message, onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });

  const navigateTo = (tab) => {
      setActiveTab(tab);
      setIsMobileMenuOpen(false);
  };

  useEffect(() => {
      if (currentUser === 'admin' && ['public_status', 'safety_status'].includes(activeTab)) {
          setActiveTab('dashboard');
          return;
      }
      if (currentUser === 'user' && activeTab === 'dashboard') {
          setActiveTab('request');
      }
  }, [activeTab, currentUser]);

  // ── 로그아웃: 모든 UI 상태 초기화 ──
  const handleLogout = () => {
      setCurrentUser(null);
      legacyCleanupRef.current = { requests: 'idle', history: 'idle' };
      requestFetchMetaRef.current = { scope: '', fetchedAt: 0 };
      historyFetchMetaRef.current = { scope: '', fetchedAt: 0 };
      staticDataLoadedRef.current = false;
      noticesLoadedRef.current = false;
      setRequests([]);
      setHistory([]);
      setInventory([]);
      setIsRequestsLoading(false);
      setIsHistoryLoading(false);
      setBulkImportModal(false);
      setBulkImportRows([]);
      setBulkImportErrors([]);
      setEditingRequest(null);
      setShowPasswordModal(false);
      setPasswordInput('');
      setActiveTab('dashboard');
      setIsMobileMenuOpen(false);
      setApprovalViewTab('pending');
      setUiLang('en');
      setHistoryFilter({ startDate: getDateDaysAgoString(HISTORY_DEFAULT_LOOKBACK_DAYS), endDate: '', storage: 'All', type: 'All' });
      setIsEditChemDropdownOpen(false);
      setInvFilter({ storage: 'All', labName: 'All', manufacturer: 'All', chemicalName: '', chemType: 'All' });
      setInvSort({ key: 'storage', dir: 'asc' });
      setInvEditModal(null);
      setInventoryEditModal(null);
      setInventoryAdjustModal(null);
      setIsSubmitting(false);
      setRequestForm({ type: 'IN', actionDate: getTodayString(), labName: '', storage: '', ext: '', chemicalName: '', amount: '', unit: 'L', manufacturer: '', bottleSize: 0, bottleUnit: '', bottleCount: '', directSize: '', directUnit: '병', directCount: '' });
  };

  useEffect(() => {
      if (currentUser !== 'admin') return;

      const markActivity = () => {
          adminActivityRef.current = Date.now();
      };

      markActivity();
      const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
      events.forEach(eventName => window.addEventListener(eventName, markActivity, { passive: true }));

      const timer = setInterval(() => {
          if (Date.now() - adminActivityRef.current >= 15 * 60 * 1000) {
              handleLogout();
              showAlert('보안 잠금', '관리자 세션이 15분 동안 비활성 상태여서 자동 로그아웃되었습니다. 다시 로그인해주세요.');
          }
      }, 30 * 1000);

      return () => {
          clearInterval(timer);
          events.forEach(eventName => window.removeEventListener(eventName, markActivity));
      };
  }, [currentUser]);

  useEffect(() => {
      if (!editingRequest) setIsEditChemDropdownOpen(false);
  }, [editingRequest]);

  // ── 관리자 로그인: 브루트포스 잠금 (5회 실패 → 30초 대기) ──
  const adminLoginAttemptsRef = useRef(0);
  const adminLockUntilRef = useRef(0);

  const handleAdminLogin = async () => {
      const now = Date.now();
      if (now < adminLockUntilRef.current) {
          const remaining = Math.ceil((adminLockUntilRef.current - now) / 1000);
          showAlert("경고", `로그인 시도가 너무 많습니다. ${remaining}초 후 다시 시도해주세요.`);
          return;
      }

      // ⚠️ 보안 강화 방법:
      // 1. 아래 평문 비교를 SHA-256 해시 비교로 교체하세요 (브라우저 내장 crypto API 사용 가능):
      //    const encoder = new TextEncoder();
      //    const data = encoder.encode(passwordInput);
      //    const hash = await crypto.subtle.digest('SHA-256', data);
      //    const hashHex = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
      //    const correct = hashHex === '미리_계산한_해시값';
      // 2. 장기적으로는 Firebase Authentication(이메일/비밀번호)으로 전환하세요.
      const ADMIN_PW = '4571'; // ← 이 값을 원하는 비밀번호로 변경하세요
      const correct = passwordInput === ADMIN_PW;

      if (correct) {
          adminLoginAttemptsRef.current = 0;
          setCurrentUser('admin');
          navigateTo('dashboard');
          setShowPasswordModal(false);
          setPasswordInput('');
      } else {
          adminLoginAttemptsRef.current += 1;
          if (adminLoginAttemptsRef.current >= 5) {
              adminLockUntilRef.current = Date.now() + 30_000;
              adminLoginAttemptsRef.current = 0;
              showAlert("경고", "비밀번호를 5회 틀렸습니다. 30초 후 다시 시도해주세요.");
          } else {
              showAlert("경고", `비밀번호가 올바르지 않습니다. (${adminLoginAttemptsRef.current}/5)`);
          }
      }
  };

  const handleUserEntry = () => {
      setCurrentUser('user');
      navigateTo('request');
  };

  const applyQuickChemical = (names = []) => {
      const candidates = (Array.isArray(names) ? names : [names]).filter(Boolean);
      const chem = candidates.map(candidate => findChemicalByAnyName(candidate)).find(Boolean) || null;
      const preferredLabel = getPreferredChemicalLabel(candidates[0] || chem?.name || '');

      setRequestForm(prev => ({
          ...prev,
          chemicalName: chem ? getPreferredChemicalLabel(chem.name) : (preferredLabel || prev.chemicalName),
          chemType: normalizeChemicalType(chem ? chem.type : prev.chemType) || prev.chemType,
          cas: chem ? chem.cas : prev.cas
      }));
      setIsChemDropdownOpen(false);
  };

  // --- CRUD Operations ---
  const submitRequest = async (keepForm = false) => {
    if (isSubmitting) return;
    if (!requestForm.labName || !requestForm.chemicalName || !requestForm.amount) {
      showAlert("안내", "필수 정보(저장소·실험실·물질명·수량)를 모두 입력해주세요."); return;
    }
    if (!requestForm.actionDate) {
      showAlert("안내", "반출입 예정일을 선택해주세요."); return;
    }

    // ✅ 반출(OUT) 신청 시 현재 재고 사전 검증 (경고만 표시, 차단은 아님)
    if (requestForm.type === 'OUT' && requestForm.storage && requestForm.chemicalName) {
      const requestedAmt = parseFloat(requestForm.amount) || 0;
      const availableItems = inventory.filter(item =>
        item.storage === requestForm.storage &&
        item.chemicalName === requestForm.chemicalName &&
        item.labName === requestForm.labName
      );
      const totalAvailable = availableItems.reduce((sum, item) => sum + Number(item.amount), 0);
      if (totalAvailable === 0) {
        showAlert("재고 주의", `현재 ${requestForm.storage}에 ${requestForm.chemicalName} 재고가 없습니다.\n신청은 가능하지만 관리자 승인 시 반려될 수 있습니다.`);
      } else if (requestedAmt > totalAvailable) {
        showAlert("재고 주의", `요청 수량(${requestedAmt}L)이 현재 재고(${totalAvailable}L)를 초과합니다.\n신청은 가능하지만 관리자 승인 시 반려될 수 있습니다.`);
      }
    }
    const chem = findChemicalByAnyName(requestForm.chemicalName);
    // 프리셋(4L병/18L캔) 처리
    const presetCnt = requestForm.bottleSize > 0 ? Number(requestForm.bottleCount) : 0;
    const presetAmt = requestForm.bottleSize > 0 && presetCnt > 0
        ? String(requestForm.bottleSize * presetCnt) : null;
    // 직접입력(수량×갯수) 처리
    const directSz  = Number(requestForm.directSize) || 0;
    const directCnt = Number(requestForm.directCount) || 0;
    const directAmt = directSz > 0 && directCnt > 0 ? String(directSz * directCnt) : null;
    // 최종값 결정
    const finalAmt       = presetAmt || directAmt || requestForm.amount;
    const finalBotSz     = requestForm.bottleSize > 0 ? requestForm.bottleSize : directSz;
    const finalBotUnit   = requestForm.bottleSize > 0 ? requestForm.bottleUnit
                           : (directSz > 0 ? (requestForm.directUnit || '병') : '');
    const finalBotCount  = requestForm.bottleSize > 0 ? String(presetCnt)
                           : (directCnt > 0 ? String(directCnt) : '');
    const newRequest = { 
        createdAt: Date.now(), 
        status: 'PENDING', 
        date: getTodayString(), 
        actionDate: requestForm.actionDate || getTodayString(),
        shelf: '미지정', 
        chemType: normalizeChemicalType(chem ? chem.type : '미지정') || '미지정', 
        cas: chem ? chem.cas : '-',
        ...requestForm,
        chemicalName: chem ? getPreferredChemicalLabel(chem.name) : requestForm.chemicalName,
        // ✅ amount를 숫자로 통일 저장 (문자열/숫자 혼용 방지)
        amount: parseFloat(finalAmt) || 0,
        bottleSize: parseFloat(finalBotSz) || 0,
        bottleUnit: finalBotUnit,
        bottleCount: finalBotCount ? String(finalBotCount) : ''
    };
    
    setIsSubmitting(true);
    try {
        if (isDemoMode) {
            setRequests([{...newRequest, id: Date.now()}, ...requests]);
        } else {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), newRequest);
        }
        if (keepForm) {
            // 이어서 신청: 저장소·실험실·유형 유지, 물질/수량/제조사만 초기화
            setRequestForm(prev => ({ ...prev, chemicalName: '', amount: '', manufacturer: '', chemType: '', cas: '', unit: 'L', bottleSize: 0, bottleUnit: '', bottleCount: '', directSize: '', directUnit: '병', directCount: '' }));
            showAlert("성공", "신청이 완료되었습니다. 다음 물질을 신청해주세요.");
        } else {
            setRequestForm({ type: 'IN', actionDate: getTodayString(), labName: '', storage: '', ext: '', chemicalName: '', amount: '', unit: 'L', manufacturer: '', chemType: '', bottleSize: 0, bottleUnit: '', bottleCount: '', directSize: '', directUnit: '병', directCount: '' });
            navigateTo('my_requests');
        }
    } catch (e) {
        showAlert("오류", "신청 중 오류가 발생했습니다.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const approveRequest = async (req) => {
    const isCheckIn = req.type === 'IN';
    const targetAmount = Number(req.amount);

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
        showAlert('오류', '승인할 수량이 올바르지 않습니다.');
        return;
    }

    const requested = getRequestedAllocations(req);
    const invalidLegacyLines = requested.invalidLines || [];
    const invalidRows = requested.invalidRows || [];
    if (invalidRows.length > 0 || invalidLegacyLines.length > 0) {
        const detail = invalidRows.length > 0
            ? `행 ${invalidRows.join(', ')}`
            : invalidLegacyLines.join(', ');
        showAlert('오류', `선반 분할 입력 형식이 올바르지 않습니다.
문제 항목: ${detail}`);
        return;
    }

    const manualAllocations = requested.allocations || [];
    if (manualAllocations.length > 0) {
        const allocationTotal = manualAllocations.reduce((sum, item) => sum + Number(item.amount), 0);
        if (Math.abs(allocationTotal - targetAmount) > 0.000001) {
            showAlert('오류', `선반 분할 합계(${allocationTotal}${req.unit || 'L'})가 총 수량(${targetAmount}${req.unit || 'L'})과 다릅니다.`);
            return;
        }
    }

    const baseInventory = inventory.map(item => ({ ...item, amount: Number(item.amount) }));
    let nextInventory = [...baseInventory];
    let resolvedAllocations = [];

    const addResolved = (shelf, amount) => {
        const normalizedShelf = shelf || '미지정';
        const existing = resolvedAllocations.find(item => item.shelf === normalizedShelf);
        if (existing) existing.amount += Number(amount);
        else resolvedAllocations.push({ shelf: normalizedShelf, amount: Number(amount) });
    };

    if (isCheckIn) {
        resolvedAllocations = manualAllocations.length > 0 ? manualAllocations.map(item => ({ ...item })) : [{ shelf: req.shelf || '미지정', amount: targetAmount }];
        resolvedAllocations.forEach((allocation, index) => {
            const shelf = allocation.shelf || '미지정';
            const found = nextInventory.find(item =>
                item.storage === req.storage &&
                (item.shelf || '미지정') === shelf &&
                item.chemicalName === req.chemicalName &&
                item.labName === req.labName &&
                item.manufacturer === req.manufacturer
            );
            if (found) {
                found.amount = Number(found.amount) + Number(allocation.amount);
            } else {
                nextInventory.push({
                    id: `NEW_IN_${index}_${Date.now()}`,
                    storage: req.storage,
                    shelf,
                    chemicalName: req.chemicalName,
                    type: req.chemType,
                    amount: Number(allocation.amount),
                    unit: req.unit,
                    manufacturer: req.manufacturer,
                    labName: req.labName,
                    cas: req.cas || '-',
                    bottleSize: req.bottleSize || 0,
                    bottleUnit: req.bottleUnit || '',
                    bottleCount: req.bottleCount || ''
                });
            }
        });
    } else {
        let candidatePool = nextInventory.filter(item =>
            item.storage === req.storage && item.chemicalName === req.chemicalName && item.labName === req.labName
        );
        if (candidatePool.length === 0) {
            candidatePool = nextInventory.filter(item =>
                item.storage === req.storage && item.chemicalName === req.chemicalName
            );
        }
        candidatePool = candidatePool.slice().sort((a, b) => String(a.shelf || '').localeCompare(String(b.shelf || ''), 'ko', { numeric: true }));
        if (candidatePool.length === 0) {
            showAlert('실패', `해당 저장소에 ${req.chemicalName} 재고가 없습니다.
[저장소: ${req.storage}]`);
            return;
        }

        if (manualAllocations.length > 0) {
            for (const allocation of manualAllocations) {
                let remainingOnShelf = Number(allocation.amount);
                const shelfMatches = candidatePool.filter(item => (item.shelf || '미지정') === (allocation.shelf || '미지정'));
                if (shelfMatches.length === 0) {
                    showAlert('실패', `${allocation.shelf} 선반에 출고 가능한 재고가 없습니다.`);
                    return;
                }
                for (const item of shelfMatches) {
                    if (remainingOnShelf <= 0) break;
                    const usable = Math.min(Number(item.amount), remainingOnShelf);
                    if (usable <= 0) continue;
                    item.amount = Number(item.amount) - usable;
                    remainingOnShelf -= usable;
                    addResolved(allocation.shelf || '미지정', usable);
                }
                if (remainingOnShelf > 0) {
                    showAlert('실패', `${allocation.shelf} 선반 재고가 부족합니다.`);
                    return;
                }
            }
        } else {
            let remaining = targetAmount;
            for (const item of candidatePool) {
                if (remaining <= 0) break;
                const usable = Math.min(Number(item.amount), remaining);
                if (usable <= 0) continue;
                item.amount = Number(item.amount) - usable;
                remaining -= usable;
                addResolved(item.shelf || '미지정', usable);
            }
            if (remaining > 0) {
                showAlert('실패', '재고가 부족하여 출고할 수 없습니다.');
                return;
            }
        }
        nextInventory = nextInventory.filter(item => Number(item.amount) > 0);
    }

    const normalizedReq = {
        ...req,
        amount: targetAmount,
        shelfAllocations: resolvedAllocations,
        shelf: resolvedAllocations.map(item => item.shelf).join(', ') || (req.shelf || '미지정'),
        inventoryLocked: false,
    };

    if (req.inventoryLocked) {
        const processedAt = Date.now();
        const historyEntries = buildHistoryEntriesFromRequest(normalizedReq, {
            actionDate: req.actionDate || getTodayString(),
            status: 'APPROVED',
            processedAt,
            originalReqId: req.id,
            inventoryUpdated: false,
        });
        if (isDemoMode) {
            setRequests(requests.map(r => r.id === req.id ? { ...r, ...normalizedReq, status: 'APPROVED', recycledAt: null } : r));
            setHistory([...historyEntries, ...history.filter(h => h.originalReqId !== req.id)]);
            showAlert('완료', '재고 변경 없이 승인 상태만 갱신했습니다.');
            return;
        }
        try {
            const batch = writeBatch(db);
            const reqRef = doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id);
            batch.update(reqRef, {
                status: 'APPROVED',
                shelf: normalizedReq.shelf,
                shelfAllocations: normalizedReq.shelfAllocations,
                recycledAt: deleteField(),
            });
            history.filter(h => h.originalReqId === req.id).forEach(h => {
                batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
            });
            historyEntries.forEach((entry) => {
                const histRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'history'));
                const { id: _tempId, ...payload } = entry;
                batch.set(histRef, payload);
            });
            await batch.commit();
            setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...normalizedReq, status: 'APPROVED', recycledAt: null } : r));
            setHistory(prev => [...historyEntries, ...prev.filter(h => h.originalReqId !== req.id)]);
            showAlert('완료', '재고 변경 없이 승인 상태만 갱신했습니다.');
            return;
        } catch (e) {
            console.error(e);
            showAlert('오류', '재승인 처리 중 문제가 발생했습니다.');
            return;
        }
    }

    if (isDemoMode) {
        const processedAt = Date.now();
        const historyEntries = buildHistoryEntriesFromRequest(normalizedReq, {
            actionDate: req.actionDate || getTodayString(),
            status: 'APPROVED',
            processedAt,
            originalReqId: req.id,
            inventoryUpdated: true,
        });
        setInventory(nextInventory);
        setRequests(requests.map(r => r.id === req.id ? { ...r, ...normalizedReq, status: 'APPROVED', recycledAt: null } : r));
        setHistory([...historyEntries, ...history.filter(h => h.originalReqId !== req.id)]);
        return;
    }

    try {
        const batch = writeBatch(db);
        const nextMap = new Map(nextInventory.filter(item => !String(item.id).startsWith('NEW_IN_')).map(item => [String(item.id), Number(item.amount)]));

        inventory.forEach((item) => {
            const currentAmount = Number(item.amount);
            const newAmount = nextMap.has(String(item.id)) ? Number(nextMap.get(String(item.id))) : 0;
            if (newAmount === currentAmount) return;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
            if (newAmount <= 0) batch.delete(docRef);
            else batch.update(docRef, { amount: newAmount });
        });

        nextInventory.filter(item => String(item.id).startsWith('NEW_IN_')).forEach((item) => {
            const docRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
            batch.set(docRef, {
                storage: item.storage,
                shelf: item.shelf,
                chemicalName: item.chemicalName,
                type: item.type,
                amount: Number(item.amount),
                unit: item.unit,
                manufacturer: item.manufacturer,
                labName: item.labName,
                cas: item.cas || '-',
                bottleSize: item.bottleSize || 0,
                bottleUnit: item.bottleUnit || '',
                bottleCount: item.bottleCount || ''
            });
        });

        const reqRef = doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id);
        batch.update(reqRef, {
            status: 'APPROVED',
            shelf: normalizedReq.shelf,
            shelfAllocations: normalizedReq.shelfAllocations,
            recycledAt: deleteField(),
            inventoryLocked: deleteField(),
        });

        history.filter(h => h.originalReqId === req.id).forEach(h => {
            batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
        });

        const processedAt = Date.now();
        const historyEntries = buildHistoryEntriesFromRequest(normalizedReq, {
            actionDate: req.actionDate || getTodayString(),
            status: 'APPROVED',
            cas: req.cas || '-',
            originalReqId: req.id,
            processedAt,
            inventoryUpdated: true,
        });

        historyEntries.forEach((entry) => {
            const histRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'history'));
            const { id: _tempId, ...payload } = entry;
            batch.set(histRef, payload);
        });

        await batch.commit();
        setInventory(nextInventory);
        setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...normalizedReq, status: 'APPROVED', recycledAt: null } : r));
        setHistory(prev => [...historyEntries, ...prev.filter(h => h.originalReqId !== req.id)]);
    } catch (e) {
        console.error(e);
        showAlert('오류', '처리 중 문제가 발생했습니다.');
    }
  };

  const rejectRequest = async (id) => {
      const req = requests.find(r => r.id === id);
      if (!req) return;
      const updatedRequest = {
          ...req,
          status: 'REJECTED',
          processedAt: Date.now(),
          actionDate: req.actionDate || getTodayString(),
          originalReqId: req.id,
      };
      if (isDemoMode) {
          setRequests(requests.map(r => r.id === id ? updatedRequest : r));
          setHistory(prev => prev.filter(h => h.originalReqId !== id && h.status !== 'REJECTED'));
          showAlert('완료', '신청이 반려 처리되었으며 반출입 기록에는 반영되지 않습니다.');
          return;
      }
      try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'requests', id), {
              status: 'REJECTED',
              processedAt: updatedRequest.processedAt,
          });
          history.filter(h => h.originalReqId === id).forEach(h => {
              batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
          });
          await batch.commit();
          setRequests(prev => prev.map(r => r.id === id ? updatedRequest : r));
          setHistory(prev => prev.filter(h => h.originalReqId !== id && h.status !== 'REJECTED'));
          showAlert('완료', '신청이 반려 처리되었으며 반출입 기록에는 반영되지 않습니다.');
      } catch (e) {
          console.error(e);
          showAlert("오류", "반려 처리 실패");
      }
  };

  const recycleRequestToPending = async (req) => {
      const rollbackAmount = Number(req.amount);
      const rollbackAllocations = Array.isArray(req.shelfAllocations) && req.shelfAllocations.length > 0
          ? req.shelfAllocations
          : [{ shelf: req.shelf || '미지정', amount: rollbackAmount }];
      const updated = {
          ...req,
          status: 'PENDING',
          inventoryLocked: false,
          recycledAt: Date.now()
      };

      const buildRolledBackInventory = () => {
          let newInv = inventory.map(item => ({ ...item, amount: Number(item.amount) }));
          if (req.status !== 'APPROVED') return newInv;

          if (req.type === 'IN') {
              rollbackAllocations.forEach(allocation => {
                  newInv = newInv.map(item => {
                      if (
                          item.storage === req.storage &&
                          (item.shelf || '미지정') === (allocation.shelf || '미지정') &&
                          item.chemicalName === req.chemicalName &&
                          item.labName === req.labName &&
                          item.manufacturer === req.manufacturer
                      ) {
                          return { ...item, amount: Number(item.amount) - Number(allocation.amount) };
                      }
                      return item;
                  }).filter(item => Number(item.amount) > 0);
              });
          } else {
              rollbackAllocations.forEach(allocation => {
                  const idx = newInv.findIndex(item =>
                      item.storage === req.storage &&
                      (item.shelf || '미지정') === (allocation.shelf || '미지정') &&
                      item.chemicalName === req.chemicalName &&
                      item.labName === req.labName
                  );
                  if (idx >= 0) {
                      newInv[idx] = { ...newInv[idx], amount: Number(newInv[idx].amount) + Number(allocation.amount) };
                  } else {
                      newInv.push({
                          id: `ROLLBACK_${Date.now()}_${allocation.shelf}`,
                          storage: req.storage,
                          shelf: allocation.shelf || '미지정',
                          chemicalName: req.chemicalName,
                          type: req.chemType || '미지정',
                          amount: Number(allocation.amount),
                          unit: req.unit,
                          manufacturer: req.manufacturer || '',
                          labName: req.labName,
                          cas: req.cas || '-'
                      });
                  }
              });
          }
          return newInv;
      };

      const rolledBackInventory = buildRolledBackInventory();

      if (isDemoMode) {
          setInventory(rolledBackInventory);
          setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
          setHistory(prev => prev.filter(h => h.originalReqId !== req.id));
          setEditingRequest(toEditableRequest(updated));
          setApprovalViewTab('pending');
          showAlert('완료', req.status === 'APPROVED' ? '재고를 롤백하고 승인 대기로 이동했습니다. 수정 후 다시 승인할 수 있습니다.' : '항목이 승인 대기로 이동되었습니다.');
          return;
      }

      try {
          const batch = writeBatch(db);
          const nextMap = new Map(rolledBackInventory.filter(item => !String(item.id).startsWith('ROLLBACK_')).map(item => [String(item.id), Number(item.amount)]));

          inventory.forEach((item) => {
              const currentAmount = Number(item.amount);
              const newAmount = nextMap.has(String(item.id)) ? Number(nextMap.get(String(item.id))) : 0;
              if (newAmount === currentAmount) return;
              const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
              if (newAmount <= 0) batch.delete(docRef);
              else batch.update(docRef, { amount: newAmount });
          });

          rolledBackInventory.filter(item => String(item.id).startsWith('ROLLBACK_')).forEach((item) => {
              const docRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
              batch.set(docRef, {
                  storage: item.storage,
                  shelf: item.shelf,
                  chemicalName: item.chemicalName,
                  type: item.type,
                  amount: Number(item.amount),
                  unit: item.unit,
                  manufacturer: item.manufacturer || '',
                  labName: item.labName,
                  cas: item.cas || '-'
              });
          });

          batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id), {
              status: 'PENDING',
              recycledAt: Date.now(),
              inventoryLocked: deleteField()
          });

          history.filter(h => h.originalReqId === req.id).forEach(h => {
              batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
          });

          await batch.commit();
          setInventory(rolledBackInventory);
          setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
          setHistory(prev => prev.filter(h => h.originalReqId !== req.id));
          setEditingRequest(toEditableRequest(updated));
          setApprovalViewTab('pending');
          showAlert('완료', req.status === 'APPROVED' ? '재고를 롤백하고 승인 대기로 이동했습니다. 수정 후 다시 승인할 수 있습니다.' : '항목이 승인 대기로 이동되었습니다.');
      } catch (e) {
          console.error(e);
          showAlert('오류', '롤백 후 승인 대기로 이동하지 못했습니다.');
      }
  };

  const handleDeleteRequest = (req, skipConfirm = false) => {
    if (currentUser !== 'admin') {
        showAlert('안내', '연구실 사용자는 신청 내역을 삭제할 수 없습니다. 관리자에게 요청해주세요.');
        return;
    }

    const rollbackAmount = Number(req.amount);
    const rollbackAllocations = Array.isArray(req.shelfAllocations) && req.shelfAllocations.length > 0
        ? req.shelfAllocations
        : [{ shelf: req.shelf || '미지정', amount: rollbackAmount }];

    const buildDeletedInventory = () => {
        let nextInventory = inventory.map(item => ({ ...item, amount: Number(item.amount) }));
        if (req.status !== 'APPROVED' || req.inventoryLocked) return nextInventory;

        if (req.type === 'IN') {
            rollbackAllocations.forEach(allocation => {
                nextInventory = nextInventory.map(item => {
                    if (
                        item.storage === req.storage &&
                        (item.shelf || '미지정') === (allocation.shelf || '미지정') &&
                        item.chemicalName === req.chemicalName &&
                        item.labName === req.labName &&
                        item.manufacturer === req.manufacturer
                    ) {
                        return { ...item, amount: Number(item.amount) - Number(allocation.amount) };
                    }
                    return item;
                }).filter(item => Number(item.amount) > 0);
            });
        } else {
            rollbackAllocations.forEach(allocation => {
                const targetIdx = nextInventory.findIndex(item =>
                    item.storage === req.storage &&
                    (item.shelf || '미지정') === (allocation.shelf || '미지정') &&
                    item.chemicalName === req.chemicalName &&
                    item.labName === req.labName
                );
                if (targetIdx !== -1) {
                    nextInventory[targetIdx] = {
                        ...nextInventory[targetIdx],
                        amount: Number(nextInventory[targetIdx].amount) + Number(allocation.amount)
                    };
                } else {
                    nextInventory.push({
                        id: `ROLLBACK_${Date.now()}_${allocation.shelf || '미지정'}`,
                        storage: req.storage,
                        shelf: allocation.shelf || '미지정',
                        chemicalName: req.chemicalName,
                        type: req.chemType || '미지정',
                        amount: Number(allocation.amount),
                        unit: req.unit,
                        manufacturer: req.manufacturer || '',
                        labName: req.labName,
                        cas: req.cas || '-'
                    });
                }
            });
        }
        return nextInventory;
    };

    const executePendingDelete = async () => {
        const nextRequests = requests.filter(r => r.id !== req.id);
        const nextHistory = history.filter(h => h.originalReqId !== req.id);

        if (isDemoMode) {
            setRequests(nextRequests);
            setHistory(nextHistory);
            showAlert('성공', '대기 중 신청이 삭제되었습니다.');
            return;
        }
        try {
            const batch = writeBatch(db);
            batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            history.filter(h => h.originalReqId === req.id).forEach(h => {
                batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
            });
            await batch.commit();
            setRequests(nextRequests);
            setHistory(nextHistory);
            showAlert('성공', '대기 중 신청이 삭제되었습니다.');
        } catch(e) {
            console.error(e);
            showAlert("오류", "삭제 실패");
        }
    };

    const executeApprovedDelete = async () => {
        const nextInventory = buildDeletedInventory();
        const nextRequests = requests.filter(r => r.id !== req.id);
        const nextHistory = history.filter(h => h.originalReqId !== req.id);

        if (isDemoMode) {
            setInventory(nextInventory.filter(item => Number(item.amount) > 0));
            setRequests(nextRequests);
            setHistory(nextHistory);
            showAlert("성공", "데이터가 롤백되어 삭제되었습니다. (데모 모드)");
            return;
        }
        try {
            const batch = writeBatch(db);
            if (req.status === 'APPROVED' && !req.inventoryLocked) {
                const nextMap = new Map(nextInventory.filter(item => !String(item.id).startsWith('ROLLBACK_')).map(item => [String(item.id), Number(item.amount)]));

                inventory.forEach((item) => {
                    const currentAmount = Number(item.amount);
                    const newAmount = nextMap.has(String(item.id)) ? Number(nextMap.get(String(item.id))) : 0;
                    if (newAmount === currentAmount) return;
                    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
                    if (newAmount <= 0) batch.delete(docRef);
                    else batch.update(docRef, { amount: newAmount });
                });

                nextInventory.filter(item => String(item.id).startsWith('ROLLBACK_')).forEach(item => {
                    batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory')), {
                        storage: item.storage,
                        shelf: item.shelf || '미지정',
                        chemicalName: item.chemicalName,
                        type: item.type || '미지정',
                        amount: Number(item.amount),
                        unit: item.unit,
                        manufacturer: item.manufacturer || '',
                        labName: item.labName,
                        cas: item.cas || '-',
                    });
                });
            }

            batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            history.filter(h => h.originalReqId === req.id).forEach(h => {
                batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
            });
            await batch.commit();
            setInventory(nextInventory.filter(item => Number(item.amount) > 0));
            setRequests(nextRequests);
            setHistory(nextHistory);
            showAlert("성공", req.inventoryLocked ? "기록이 삭제되었습니다." : "데이터가 롤백되어 삭제되었습니다.");
        } catch (e) {
            console.error(e);
            showAlert("오류", "롤백 삭제 실패");
        }
    };

    if (req.status === 'PENDING') {
        if (skipConfirm) return executePendingDelete();
        showConfirm("삭제", "승인 전 신청 내역을 삭제하시겠습니까? (재고 변동 없음)", executePendingDelete);
    } else {
        if (skipConfirm) return executeApprovedDelete();
        showConfirm(
            "승인 내역 삭제 (롤백)",
            req.inventoryLocked
                ? "재고 유지 편집 모드 항목입니다. 재고 변동 없이 기록만 삭제됩니다. 계속하시겠습니까?"
                : "승인된 내역을 삭제하면 재고가 원래대로 복구됩니다. 진행하시겠습니까?",
            executeApprovedDelete
        );
    }
  };

  const handleSaveMasterData = async () => {
    try {
      if (masterAddModal.type === 'lab') {
          if (!newLabData.name) return showAlert("오류", "실험실명을 입력하세요.");
          if (isDemoMode) setLabs(prev => [...prev, { id: String(Date.now()), ...newLabData }].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })));
          else {
              const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'labs'), newLabData);
              setLabs(prev => [...prev, { id: docRef.id, ...newLabData }].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })));
              staticDataLoadedRef.current = true;
          }
          setNewLabData({ name: '', loc: '', ext: '', storage: '제1공학관' });
      } else if (masterAddModal.type === 'chemical') {
          if (!newChemData.name) return showAlert("오류", "물질명을 입력하세요.");
          if (isDemoMode) setChemicals(prev => [...prev, { id: String(Date.now()), ...newChemData }].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })));
          else {
              const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chemicals'), newChemData);
              setChemicals(prev => [...prev, { id: docRef.id, ...newChemData }].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })));
              staticDataLoadedRef.current = true;
          }
          setNewChemData({ cas: '', name: '', type: '1석유류(비)' });
      } else if (masterAddModal.type === 'manufacturer') {
          const normalizedManufacturer = getManufacturerName(newManufacturer);
          if (!normalizedManufacturer) return showAlert("오류", "제조사명을 입력하세요.");
          if (manufacturers.some(m => normalizeChemicalKey(getManufacturerName(m)) === normalizeChemicalKey(normalizedManufacturer))) return showAlert("오류", "이미 존재합니다.");
          if (isDemoMode) setManufacturers(prev => [...prev, { id: String(Date.now()), name: normalizedManufacturer }].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })));
          else {
              const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'manufacturers'), { name: normalizedManufacturer });
              setManufacturers(prev => [...prev, { id: docRef.id, name: normalizedManufacturer }].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true })));
              staticDataLoadedRef.current = true;
          }
          setNewManufacturer('');
      }
      setMasterAddModal({ isOpen: false, type: '' });
      showAlert("성공", "저장되었습니다.");
    } catch (e) {
      showAlert("오류", "저장 실패: " + e.message);
    }
  };

  const handleDeleteMasterData = (type, idOrValue) => {
      showConfirm("삭제", "정말 삭제하시겠습니까?", async () => {
          if (isDemoMode) {
              if (type === 'lab') setLabs(labs.filter(l => l.id !== idOrValue));
              if (type === 'chemical') setChemicals(chemicals.filter(c => c.id !== idOrValue));
              if (type === 'manufacturer') setManufacturers(manufacturers.filter(m => m.id !== idOrValue));
              showAlert("성공", "삭제되었습니다. (데모)");
              return;
          }
          try {
              const colName = type === 'lab' ? 'labs' : type === 'chemical' ? 'chemicals' : 'manufacturers';
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', colName, idOrValue));
              if (type === 'lab') setLabs(prev => prev.filter(l => l.id !== idOrValue));
              if (type === 'chemical') setChemicals(prev => prev.filter(c => c.id !== idOrValue));
              if (type === 'manufacturer') setManufacturers(prev => prev.filter(m => m.id !== idOrValue));
              staticDataLoadedRef.current = true;
              showAlert("성공", "삭제되었습니다.");
          } catch(e) {
              showAlert("오류", "삭제 실패");
          }
      });
  };

  // --- 반출입 일괄 등록 ---
  const handleBulkImportFile = async (file) => {
    try {
      const rows = await parseFileToRows(file);
      const UNITS = ['L', 'kg', 'mL', 'g', 'Can', 'Bottle'];
      const STORAGES = ['제1공학관', '제1과학기술관', '동물실험동'];
      const parsed = [];
      const errors = [];

      rows.forEach((parts, idx) => {
        const rowNum = idx + 2;
        const type         = String(parts[0] || '').trim().toUpperCase();
        const storage      = String(parts[1] || '').trim();
        const labName      = String(parts[2] || '').trim();
        const chemicalName = String(parts[3] || '').trim();
        const amount       = parseFloat(String(parts[4] || '').trim());
        const unit         = String(parts[5] || 'L').trim();
        // 새 컬럼: 병수(6), 병단위(7) → 기존 파일 호환(6=제조사, 7=신청자)
        const col6         = String(parts[6] || '').trim();
        const col7         = String(parts[7] || '').trim();
        const col8         = String(parts[8] || '').trim();
        const col9         = String(parts[9] || '').trim();
        // 병수/병단위 자동 감지
        const BOTTLE_UNITS = ['병','캔','개','팩','박스'];
        let bottleCount = 0, bottleUnit = '', manufacturer = '';
        if (parts.length >= 10) {
          // 10컬럼 이상: 유형,저장소,실험실명,물질명,수량,단위,병수,병단위,제조사,(구형)신청자
          bottleCount   = isNaN(Number(col6)) ? 0 : Number(col6);
          bottleUnit    = BOTTLE_UNITS.includes(col7) ? col7 : '';
          manufacturer  = col8;
        } else {
          // 8컬럼 구형: 유형,저장소,실험실명,물질명,수량,단위,제조사,(구형)신청자
          manufacturer  = col6;
        }

        const rowErrors = [];
        if (!['IN','OUT'].includes(type)) rowErrors.push(`유형(IN/OUT) 오류`);
        if (!STORAGES.includes(storage)) rowErrors.push(`저장소 오류: "${storage}"`);
        if (!labName) rowErrors.push(`실험실명 누락`);
        if (!chemicalName) rowErrors.push(`물질명 누락`);
        if (isNaN(amount) || amount <= 0) rowErrors.push(`수량 오류: "${parts[4]}"`);
        if (!UNITS.includes(unit) && !['L','mL','kg','g'].includes(unit)) rowErrors.push(`단위 오류(${UNITS.join('/')})`);

        const chem = findChemicalByAnyName(chemicalName);
        const lab = labs.find(l => l.name === labName);
        const ext = lab ? lab.ext : '';
        const calcBottleSize = bottleCount > 0 && amount > 0 ? amount / bottleCount : 0;

        if (rowErrors.length > 0) {
          errors.push({ rowNum, errors: rowErrors, data: parts });
        } else {
          parsed.push({
            _rowNum: rowNum, _valid: true,
            type, storage, labName, ext, chemicalName: chem ? getPreferredChemicalLabel(chem.name) : chemicalName,
            chemType: normalizeChemicalType(chem ? chem.type : '미지정') || '미지정',
            cas: chem ? chem.cas : '-',
            amount: String(amount), unit,
            bottleCount: bottleCount > 0 ? String(bottleCount) : '',
            bottleUnit: bottleUnit,
            bottleSize: calcBottleSize,
            manufacturer,
            shelf: '미지정',
          });
        }
      });

      setBulkImportRows(parsed);
      setBulkImportErrors(errors);
    } catch(err) {
      showAlert("오류", "파일 읽기 실패: " + err.message);
    }
  };

  const handleBulkImportSubmit = async () => {
    if (bulkImportRows.length === 0) {
      showAlert("안내", "등록할 데이터가 없습니다.");
      return;
    }
    let successCount = 0;
    // ✅ 실패 건수를 별도 추적
    let failCount = 0;
    for (const row of bulkImportRows) {
      const newRequest = {
        createdAt: Date.now() + successCount,
        status: 'PENDING',
        date: getTodayString(),
        // ✅ actionDate 누락 수정
        actionDate: getTodayString(),
        type: row.type,
        storage: row.storage,
        labName: row.labName,
        ext: row.ext,
        chemicalName: row.chemicalName,
        chemType: row.chemType,
        cas: row.cas,
        // ✅ amount 숫자 저장 통일
        amount: parseFloat(row.amount) || 0,
        unit: row.unit,
        bottleSize: parseFloat(row.bottleSize) || 0,
        bottleUnit: row.bottleUnit || '',
        bottleCount: row.bottleCount || '',
        manufacturer: row.manufacturer,
        shelf: row.shelf,
      };
      try {
        if (isDemoMode) {
          setRequests(prev => [{ ...newRequest, id: Date.now() + successCount }, ...prev]);
        } else {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), newRequest);
        }
        successCount++;
      } catch(e) {
        console.error('일괄 등록 실패', e);
        // ✅ 실패 건수 누적
        failCount++;
      }
    }
    setBulkImportModal(false);
    setBulkImportRows([]);
    setBulkImportErrors([]);
    // ✅ 성공/실패 건수 모두 표시
    if (failCount > 0) {
      showAlert("완료 (일부 실패)", `${successCount}건 등록 완료, ${failCount}건 저장 실패.\n실패 항목은 다시 시도해주세요.`);
    } else {
      showAlert("완료", `${successCount}건이 신청 대기 목록에 등록되었습니다.`);
    }
    navigateTo('my_requests');
  };

  // --- 재고 병/캔 단위 편집 저장 ---
  const handleSaveInvBottleUnit = async () => {
    if (!invEditModal) return;
    const { id, bottleSize, bottleUnit } = invEditModal;
    if (isDemoMode) {
      setInventory(prev => prev.map(i => i.id === id ? { ...i, bottleSize: bottleSize || 0, bottleUnit: bottleUnit || '' } : i));
      setInvEditModal(null);
      showAlert("성공", "병/캔 단위 설정이 저장되었습니다.");
      return;
    }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id), {
        bottleSize: bottleSize || 0,
        bottleUnit: bottleUnit || ''
      });
      setInvEditModal(null);
      showAlert("성공", "병/캔 단위 설정이 저장되었습니다.");
    } catch(e) {
      showAlert("오류", "저장 실패: " + e.message);
    }
  };


  const openInventoryEditModal = (item) => {
    const matchedChemical = findChemicalByAnyName(item.chemicalName);
    setInventoryEditModal({
      ...item,
      storage: String(item.storage || '').trim(),
      labName: String(item.labName || '').trim(),
      shelf: item.shelf === '미지정' ? '' : String(item.shelf || '').trim(),
      chemicalName: getPreferredChemicalLabel(matchedChemical?.name || item.chemicalName || ''),
      chemType: normalizeChemicalType(item.chemType || item.type || matchedChemical?.type || '') || '미지정',
      manufacturer: getManufacturerName(item.manufacturer),
      amount: String(item.amount ?? ''),
      unit: String(item.unit || 'L').trim() || 'L',
      reason: '',
    });
  };

  const handleSaveInventoryRecordEdit = async () => {
    if (!inventoryEditModal || isSubmitting) return;

    const sourceItem = inventory.find(item => item.id === inventoryEditModal.id);
    if (!sourceItem) {
      showAlert('오류', '원본 재고 데이터를 찾을 수 없습니다.');
      return;
    }

    const matchedChemical = findChemicalByAnyName(inventoryEditModal.chemicalName);
    const normalizedAmount = Number(inventoryEditModal.amount);
    const normalizedStorage = String(inventoryEditModal.storage || '').trim();
    const normalizedLabName = String(inventoryEditModal.labName || '').trim();
    const normalizedShelf = String(inventoryEditModal.shelf || '').trim() || '미지정';
    const normalizedChemicalName = String(getPreferredChemicalLabel(matchedChemical?.name || inventoryEditModal.chemicalName || '')).trim();
    const normalizedManufacturer = getManufacturerName(inventoryEditModal.manufacturer);
    const normalizedUnit = String(inventoryEditModal.unit || 'L').trim() || 'L';
    const normalizedType = normalizeChemicalType(inventoryEditModal.chemType || matchedChemical?.type || sourceItem.chemType || sourceItem.type || '') || '미지정';
    const normalizedCas = String(matchedChemical?.cas || inventoryEditModal.cas || sourceItem.cas || '-').trim() || '-';
    const reason = String(inventoryEditModal.reason || '').trim();
    const bottleSize = Number(sourceItem.bottleSize || inventoryEditModal.bottleSize || 0);

    if (!normalizedStorage || !normalizedLabName || !normalizedChemicalName) {
      showAlert('오류', '저장소, 실험실, 물질명은 필수입니다.');
      return;
    }
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      showAlert('오류', '수량은 0 이상의 숫자여야 합니다.');
      return;
    }

    const patch = {
      storage: normalizedStorage,
      labName: normalizedLabName,
      shelf: normalizedShelf,
      chemicalName: normalizedChemicalName,
      manufacturer: normalizedManufacturer,
      chemType: normalizedType,
      type: normalizedType,
      cas: normalizedCas,
      amount: normalizedAmount,
      unit: normalizedUnit,
      bottleCount: bottleSize > 0 && normalizedAmount > 0 ? String(Math.round(normalizedAmount / bottleSize)) : '',
      lastEditedAt: Date.now(),
      lastEditedBy: currentUser || 'admin',
      lastEditReason: reason || '재고 정보 정정',
    };

    const changedFields = getInventoryChangeSummary(sourceItem, patch);
    if (changedFields.length === 0) {
      showAlert('안내', '변경된 내용이 없습니다.');
      return;
    }
    if (!reason) {
      showAlert('오류', '재고 정보 수정 사유를 입력해주세요.');
      return;
    }
    if (hasDuplicateInventoryRecord(inventory, patch, inventoryEditModal.id)) {
      showAlert('중복 경고', '동일한 저장소/실험실/선반/물질/제조사 조합의 재고가 이미 있습니다. 중복 저장을 막기 위해 수정이 차단되었습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isDemoMode) {
        setInventory(prev => prev.map(item => item.id === inventoryEditModal.id ? { ...item, ...patch } : item));
      } else {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', inventoryEditModal.id), patch);
        setInventory(prev => prev.map(item => item.id === inventoryEditModal.id ? { ...item, ...patch } : item));
      }

      setInventoryEditModal(null);
      showAlert('완료', `재고 정보를 수정했습니다. (${changedFields.join(', ')})`);
    } catch (e) {
      showAlert('오류', '재고 정보 수정 저장 실패: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openInventoryAdjustModal = (item) => {
    const currentAmount = Number(item.amount || 0);
    setInventoryAdjustModal({
      ...item,
      currentAmount,
      actualAmount: String(currentAmount),
      reason: '',
      chemType: getResolvedChemicalType(item, chemicals),
    });
  };

  const handleQuickInventoryAdjust = async () => {
    if (!inventoryAdjustModal || isSubmitting) return;

    const currentAmount = Number(inventoryAdjustModal.currentAmount ?? inventoryAdjustModal.amount ?? 0);
    const actualAmount = Number(inventoryAdjustModal.actualAmount);
    const normalizedType = normalizeChemicalType(inventoryAdjustModal.chemType) || getResolvedChemicalType(inventoryAdjustModal, chemicals);
    const delta = Number((actualAmount - currentAmount).toFixed(4));
    const reason = String(inventoryAdjustModal.reason || '').trim();

    if (!Number.isFinite(actualAmount) || actualAmount < 0) {
      showAlert('오류', '실재고 수량은 0 이상의 숫자여야 합니다.');
      return;
    }
    if (Math.abs(delta) > 0.000001 && !reason) {
      showAlert('오류', '재고 변경 사유를 입력해주세요.');
      return;
    }

    const nextBottleCount = inventoryAdjustModal.bottleSize > 0 && actualAmount > 0
      ? String(Math.round(actualAmount / inventoryAdjustModal.bottleSize))
      : '';

    const patch = {
      amount: actualAmount,
      type: normalizedType,
      chemType: normalizedType,
      bottleCount: nextBottleCount,
      lastAdjustedAt: Date.now(),
      lastAdjustedBy: currentUser || 'admin',
      lastAdjustedReason: reason || '실사 재고 일치 처리',
      lastAdjustedDelta: delta,
    };

    setIsSubmitting(true);
    try {
      if (isDemoMode) {
        setInventory(prev => prev.map(item => item.id === inventoryAdjustModal.id ? { ...item, ...patch } : item));
      } else {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', inventoryAdjustModal.id), patch);
        setInventory(prev => prev.map(item => item.id === inventoryAdjustModal.id ? { ...item, ...patch } : item));
      }

      setInventoryAdjustModal(null);
      showAlert('완료', `재고를 ${currentAmount}${inventoryAdjustModal.unit || 'L'} → ${actualAmount}${inventoryAdjustModal.unit || 'L'}로 보정했습니다.`);
    } catch (e) {
      showAlert('오류', '재고 보정 저장 실패: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const renderInventoryAdjustModal = () => {
    if (!inventoryAdjustModal) return null;
    const currentAmount = Number(inventoryAdjustModal.currentAmount ?? inventoryAdjustModal.amount ?? 0);
    const actualAmount = Number(inventoryAdjustModal.actualAmount || 0);
    const delta = Number.isFinite(actualAmount) ? Number((actualAmount - currentAmount).toFixed(4)) : 0;
    const hasBottlePreset = Number(inventoryAdjustModal.bottleSize) > 0;

    return (
      <div className="fixed inset-0 bg-black/55 flex items-end sm:items-center justify-center z-[120] p-2 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100dvh-0.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">재고 불일치 빠른 보정</h3>
              <p className="text-sm text-slate-500 mt-1">실사 수량 기준으로 즉시 맞추고, 보정 이력을 남깁니다.</p>
            </div>
            <button onClick={() => setInventoryAdjustModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">대상 물질</div>
              <div className="mt-1 font-bold text-slate-800">{inventoryAdjustModal.chemicalName}</div>
              <div className="mt-1 text-xs text-slate-500">{inventoryAdjustModal.storage} · {inventoryAdjustModal.labName} · {inventoryAdjustModal.shelf || '미지정'}</div>
            </div>
            <div className="rounded-xl border bg-blue-50 p-4">
              <div className="text-xs font-bold text-blue-700">현재 전산 재고</div>
              <div className="mt-1 text-2xl font-bold text-blue-700">{currentAmount}{inventoryAdjustModal.unit || 'L'}</div>
              <div className="mt-1 text-xs text-blue-600">{inventoryAdjustModal.manufacturer || '-'} · {inventoryAdjustModal.chemType || '미지정'}</div>
            </div>
          </div>

          <div className="space-y-3 overflow-y-auto px-5 pb-6 sm:px-6">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">실재고 수량</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={inventoryAdjustModal.actualAmount}
                  onChange={e => setInventoryAdjustModal(prev => ({ ...prev, actualAmount: e.target.value }))}
                  className="flex-1 border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="실재고를 입력하세요"
                />
                <span className="px-4 flex items-center rounded-xl bg-slate-100 text-slate-600 font-bold">{inventoryAdjustModal.unit || 'L'}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setInventoryAdjustModal(prev => ({ ...prev, actualAmount: String(currentAmount) }))} className="px-3 py-2 rounded-lg border bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">현재값 복원</button>
              <button type="button" onClick={() => setInventoryAdjustModal(prev => ({ ...prev, actualAmount: '0' }))} className="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-sm font-bold hover:bg-rose-100">0으로 정리</button>
              {hasBottlePreset && (
                <>
                  <button type="button" onClick={() => setInventoryAdjustModal(prev => ({ ...prev, actualAmount: String(Math.max(0, currentAmount - Number(prev.bottleSize || 0))) }))} className="px-3 py-2 rounded-lg border bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">-1 {inventoryAdjustModal.bottleUnit || '병'}</button>
                  <button type="button" onClick={() => setInventoryAdjustModal(prev => ({ ...prev, actualAmount: String(currentAmount + Number(prev.bottleSize || 0)) }))} className="px-3 py-2 rounded-lg border bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">+1 {inventoryAdjustModal.bottleUnit || '병'}</button>
                </>
              )}
            </div>

            <div className={`rounded-xl border px-4 py-3 text-sm ${delta === 0 ? 'bg-slate-50 text-slate-600 border-slate-200' : delta > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              변경 차이: <span className="font-bold">{delta > 0 ? '+' : ''}{Number.isFinite(delta) ? delta : 0}{inventoryAdjustModal.unit || 'L'}</span>
              {hasBottlePreset && Number(inventoryAdjustModal.bottleSize) > 0 && Number(inventoryAdjustModal.actualAmount) > 0 && (
                <span className="ml-2 text-xs opacity-80">≈ {Math.round(Number(inventoryAdjustModal.actualAmount) / Number(inventoryAdjustModal.bottleSize))}{inventoryAdjustModal.bottleUnit || '병'}</span>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">보정 사유</label>
              <textarea
                rows={3}
                value={inventoryAdjustModal.reason}
                onChange={e => setInventoryAdjustModal(prev => ({ ...prev, reason: e.target.value }))}
                className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="예: 실사 결과 1병 누락 발견, 라벨 오기입 수정"
              />
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex gap-3 border-t bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6">
            <button onClick={() => setInventoryAdjustModal(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">취소</button>
            <button onClick={handleQuickInventoryAdjust} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow">재고 보정 저장</button>
          </div>
        </div>
      </div>
    );
  };

  const renderInventoryRecordEditModal = () => {
    if (!inventoryEditModal) return null;

    const storageOptions = Array.from(new Set([
      ...inventory.map(item => item.storage),
      ...labs.map(lab => lab.storage),
      '제1공학관', '제1과학기술관', '동물실험동', '기타',
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
    const manufacturerOptions = Array.from(new Set(manufacturers.map(getManufacturerName).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
    const shelfSuggestions = getSuggestedShelves(inventoryEditModal.storage, inventoryEditModal.labName, inventoryEditModal.shelf);
    const duplicateDetected = hasDuplicateInventoryRecord(inventory, {
      ...inventoryEditModal,
      shelf: String(inventoryEditModal.shelf || '').trim() || '미지정',
      manufacturer: getManufacturerName(inventoryEditModal.manufacturer),
      chemType: normalizeChemicalType(inventoryEditModal.chemType || inventoryEditModal.type || ''),
    }, inventoryEditModal.id);

    return (
      <div className="fixed inset-0 bg-black/55 flex items-end sm:items-center justify-center z-[120] p-2 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[calc(100dvh-0.5rem)] sm:max-h-[88vh] overflow-hidden flex flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">재고 기본 정보 수정</h3>
              <p className="text-sm text-slate-500 mt-1">실험실, 저장소, 선반, 제조사, 물질명 등 잘못 들어간 재고 데이터를 바로잡습니다.</p>
            </div>
            <button onClick={() => setInventoryEditModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
          </div>

          <div className="overflow-y-auto px-5 pb-6 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">저장소</label>
                <select
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.storage}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, storage: e.target.value }))}>
                  <option value="">저장소 선택</option>
                  {storageOptions.map(storage => <option key={storage} value={storage}>{storage}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">실험실</label>
                <input
                  list="inventory-edit-lab-list"
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.labName}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, labName: e.target.value }))}
                  placeholder="실험실명 입력 또는 선택"
                />
                <datalist id="inventory-edit-lab-list">
                  {[...labs].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko')).map((lab) => <option key={lab.id || lab.name} value={lab.name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">선반</label>
                <input
                  list="inventory-edit-shelf-list"
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.shelf}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, shelf: e.target.value }))}
                  placeholder="미입력 시 미지정"
                />
                <datalist id="inventory-edit-shelf-list">
                  {shelfSuggestions.map((shelf) => <option key={shelf} value={shelf} />)}
                </datalist>
                {shelfSuggestions.length > 0 && <p className="mt-1 text-[11px] text-slate-400">추천 선반: {shelfSuggestions.slice(0, 6).join(', ')}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">제조사</label>
                <input
                  list="inventory-edit-manufacturer-list"
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.manufacturer}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, manufacturer: e.target.value }))}
                  placeholder="제조사 입력 또는 선택"
                />
                <datalist id="inventory-edit-manufacturer-list">
                  {manufacturerOptions.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">물질명</label>
                <input
                  list="inventory-edit-chemical-list"
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.chemicalName}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, chemicalName: e.target.value }))}
                  placeholder="한글/영문 물질명"
                />
                <datalist id="inventory-edit-chemical-list">
                  {[...chemicals].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko')).map((chemical) => <option key={chemical.id || chemical.name} value={chemical.name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">성상</label>
                <select
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.chemType}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, chemType: e.target.value }))}>
                  {['1석유류(비)', '1석유류(수)', '알코올류', '2석유류(비)', '2석유류(수)', '3석유류(비)', '3석유류(수)', '4석유류', '동식물유', '특수인화물', '산화성액체', '유독물질', '해당없음', '미지정'].map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">수량</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.amount}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">단위</label>
                <input
                  className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={inventoryEditModal.unit || 'L'}
                  onChange={e => setInventoryEditModal(prev => ({ ...prev, unit: e.target.value }))}
                  placeholder="예: L, kg"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">수정 사유</label>
              <textarea
                rows={3}
                className="w-full border p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={inventoryEditModal.reason}
                onChange={e => setInventoryEditModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="예: 잘못 등록된 실험실/제조사 정정, 저장소 위치 오기입 수정"
              />
            </div>

            {duplicateDetected && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                동일한 저장소/실험실/선반/물질/제조사 조합이 이미 존재합니다. 중복 행 생성을 막기 위해 현재 상태로는 저장되지 않습니다.
              </div>
            )}

            {inventoryEditModal.lastEditedAt && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                최근 수정: <span className="font-bold text-slate-700">{formatAdminDateTime(inventoryEditModal.lastEditedAt)}</span> · {inventoryEditModal.lastEditReason || '-'}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 mt-auto flex gap-3 border-t bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6">
            <button onClick={() => setInventoryEditModal(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">취소</button>
            <button onClick={handleSaveInventoryRecordEdit} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow">재고 정보 저장</button>
          </div>
        </div>
      </div>
    );
  };

  const renderInvEditModal = () => {
    if (!invEditModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-0.5rem)] sm:max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
            <h3 className="text-lg font-bold text-slate-800">병/캔 단위 설정</h3>
            <button onClick={() => setInvEditModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
          </div>
          <div className="overflow-y-auto px-5 pb-6 sm:px-6">
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
            <div className="font-bold text-slate-800">{invEditModal.chemicalName}</div>
            <div className="text-xs text-slate-500">{invEditModal.storage} · {invEditModal.labName}</div>
            <div className="text-xs text-slate-500 mt-1">현재 재고: <span className="font-bold text-blue-600">{invEditModal.amount}{invEditModal.unit || 'L'}</span></div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">용기 타입 선택</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: '🍶 4L 병', size: 4, unit: '병', custom: false },
                  { label: '🥫 18L 캔', size: 18, unit: '캔', custom: false },
                  { label: '✏️ 직접', size: -1, unit: '', custom: true },
                  { label: '없음', size: 0, unit: '', custom: false },
                ].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (opt.custom) {
                        setInvEditModal({...invEditModal, isCustom: true,
                          bottleSize: Number(invEditModal.customSize)||0,
                          bottleUnit: invEditModal.customUnit||'병'});
                      } else {
                        setInvEditModal({...invEditModal, isCustom: false,
                          bottleSize: opt.size, bottleUnit: opt.unit});
                      }
                    }}
                    className={`flex-1 min-w-[60px] py-2 px-2 rounded-lg text-xs font-bold border-2 transition ${
                      opt.custom
                        ? (invEditModal.isCustom ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500')
                        : (!invEditModal.isCustom && invEditModal.bottleSize === opt.size && invEditModal.bottleUnit === opt.unit ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500')
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* 직접입력 시 용량/단위 입력 */}
              {invEditModal.isCustom && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">1개당 용량</label>
                    <input type="number" min="0.1" step="0.1"
                      className="w-full border p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="예: 2.5"
                      value={invEditModal.customSize || ''}
                      onChange={e => setInvEditModal({...invEditModal,
                        customSize: e.target.value,
                        bottleSize: Number(e.target.value) || 0})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">단위</label>
                    <select className="w-full border p-2 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={invEditModal.customUnit || '병'}
                      onChange={e => setInvEditModal({...invEditModal,
                        customUnit: e.target.value, bottleUnit: e.target.value})}
                    >
                      {['병','캔','개','팩','박스'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
            {invEditModal.bottleSize > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 font-medium">
                현재 재고: {invEditModal.amount}{invEditModal.unit || 'L'} ÷ {invEditModal.bottleSize}{invEditModal.unit || 'L'} = <span className="text-lg font-bold">{Math.round(invEditModal.amount / invEditModal.bottleSize)}{invEditModal.bottleUnit}</span>
              </div>
            )}
          </div>
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-3 border-t bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6">
            <button onClick={() => setInvEditModal(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">취소</button>
            <button onClick={handleSaveInvBottleUnit} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow">저장</button>
          </div>
        </div>
      </div>
    );
  };

  // --- View Components ---
  const renderModal = () => {
      if (!modal.isOpen) return null;
      return (
          <div className="fixed inset-0 bg-black/45 z-[260] flex items-start justify-center p-4 pt-6 md:pt-10">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 border border-slate-200">
                  <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${modal.type === 'confirm' ? 'text-orange-600' : 'text-blue-600'}`}>
                      {modal.type === 'confirm' ? <AlertTriangle size={24}/> : <Info size={24}/>} {modal.title}
                  </h3>
                  <p className="text-slate-600 mb-6 leading-relaxed whitespace-pre-line">{modal.message}</p>
                  <div className="flex gap-3 justify-end">
                      {modal.type === 'confirm' && <button onClick={closeModal} className="px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 font-medium">취소</button>}
                      <button onClick={() => { if(modal.onConfirm) modal.onConfirm(); closeModal(); }} className={`px-4 py-2 text-white rounded-lg font-medium ${modal.type === 'confirm' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>확인</button>
                  </div>
              </div>
          </div>
      );
  };

  const renderSubmittingOverlay = () => {
      if (!isSubmitting) return null;
      return (
          <div className="fixed inset-0 bg-black/45 z-[190] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 text-center max-w-sm w-full">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold text-slate-800">잠시만 기다려주세요</h3>
                  <p className="text-sm text-slate-500 mt-2">반출입 신청을 저장하고 있습니다. 중복 제출을 막기 위해 버튼은 잠시 비활성화됩니다.</p>
              </div>
          </div>
      );
  };

  const renderBulkImportModal = () => {
    if (!bulkImportModal) return null;
    const SAMPLE_URL = "data:text/csv;charset=utf-8,\uFEFF유형(IN/OUT),저장소,실험실명,물질명,수량(L),단위,병수,병단위,제조사,\nIN,제1공학관,연구실A,Acetone,20,L,5,병,삼전순약공업,홍길동\nIN,제1공학관,연구실A,Methanol,18,L,1,캔,삼전순약공업,홍길동\nOUT,제1공학관,연구실A,Acetone,4,L,1,병,,홍길동\nIN,제1공학관,연구실B,에탄올,2.5,L,1,병,,김연구";
    return (
      <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-2 md:p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4 md:p-6 border-b bg-purple-50 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="text-purple-600" size={24}/>
              <div>
                <h3 className="text-lg font-bold text-slate-800">반출입 엑셀 일괄 등록</h3>
                <p className="text-xs text-slate-500">CSV 또는 엑셀 파일(xlsx/xls)로 여러 건을 한번에 신청합니다.</p>
              </div>
            </div>
            <button onClick={() => setBulkImportModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
          </div>

          {/* 본문 */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {/* 파일 업로드 영역 */}
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 px-5 py-3 bg-purple-600 text-white rounded-xl font-bold cursor-pointer hover:bg-purple-700 transition shadow">
                <Upload size={18}/> 파일 선택 (CSV/xlsx)
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { if(e.target.files[0]) handleBulkImportFile(e.target.files[0]); e.target.value=''; }}/>
              </label>
              <a href={SAMPLE_URL} download="반출입_일괄등록_양식.csv"
                className="flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition text-sm">
                <Download size={16}/> 양식 다운로드
              </a>
              <div className="text-xs text-slate-500 bg-slate-50 border rounded-lg p-2 flex-1 min-w-[200px]">
                <strong>컬럼 순서:</strong> 유형(IN/OUT) | 저장소 | 실험실명 | 물질명 | 수량(L) | 단위 | 병수 | 병단위 | 제조사
              </div>
            </div>

            {/* 오류 목록 */}
            {bulkImportErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h4 className="font-bold text-red-700 mb-2 flex items-center gap-2"><AlertTriangle size={16}/> {bulkImportErrors.length}건 오류 (자동 제외됨)</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {bulkImportErrors.map((e) => (
                    <div key={e.rowNum} className="text-xs text-red-600 bg-white rounded p-1.5 border border-red-100">
                      <span className="font-bold">{e.rowNum}행:</span> {e.errors.join(', ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 유효 데이터 미리보기 */}
            {bulkImportRows.length > 0 ? (
              <div>
                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <CheckCircle className="text-green-500" size={16}/> 
                  등록 예정 <span className="text-green-600">{bulkImportRows.length}건</span>
                </h4>
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        {['#','유형','저장소','실험실','물질명','수량','단위','병/캔','제조사'].map(h => (
                          <th key={h} className="p-2 text-left font-bold text-slate-600 whitespace-nowrap">{h}</th>
                        ))}
                        <th className="p-2">제거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportRows.map((row, rowIndex) => (
                        <tr key={row._rowNum} className={`border-t ${bulkImportRows.indexOf(row)%2===0?'bg-white':'bg-slate-50'}`}>
                          <td className="p-2 text-slate-400">{row._rowNum}</td>
                          <td className="p-2"><span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${row.type==='IN'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{row.type==='IN'?'반입':'반출'}</span></td>
                          <td className="p-2 whitespace-nowrap">{row.storage}</td>
                          <td className="p-2 whitespace-nowrap">{row.labName}</td>
                          <td className="p-2 font-bold whitespace-nowrap">{row.chemicalName}</td>
                          <td className="p-2 text-right">{row.amount}</td>
                          <td className="p-2">{row.unit}</td>
                          <td className="p-2 whitespace-nowrap text-xs text-blue-600">{row.bottleCount ? `${row.bottleCount}${row.bottleUnit}` : '-'}</td>
                          <td className="p-2">{row.manufacturer || '-'}</td>
                          <td className="p-2 text-center">
                            <button onClick={() => setBulkImportRows(prev => prev.filter((_, idx) => idx !== rowIndex))} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <FileSpreadsheet size={48} className="mx-auto mb-3 opacity-30"/>
                <p>파일을 선택하면 미리보기가 표시됩니다.</p>
              </div>
            )}
          </div>

          {/* 하단 버튼 */}
          <div className="p-4 md:p-6 border-t flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
            <button onClick={() => setBulkImportModal(false)} className="px-6 py-2.5 bg-slate-200 rounded-xl font-bold hover:bg-slate-300">취소</button>
            <button 
              onClick={handleBulkImportSubmit}
              disabled={bulkImportRows.length === 0}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow"
            >
              <PackagePlus size={16}/> {bulkImportRows.length}건 일괄 신청
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── 공지사항 관리 화면 (관리자 전용) ──
  const renderNoticesScreen = () => (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Megaphone className="text-yellow-500"/> 공지사항 관리
      </h2>

      {/* 작성 폼 */}
      <div className="bg-white rounded-xl shadow border p-5 space-y-3">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">새 공지사항 작성</h3>
        <input
          type="text"
          placeholder="제목"
          className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-yellow-400 text-sm"
          value={noticeForm.title}
          onChange={e => setNoticeForm({...noticeForm, title: e.target.value})}
        />
        <textarea
          placeholder="내용을 입력하세요..."
          rows={4}
          className="w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-yellow-400 text-sm resize-none"
          value={noticeForm.content}
          onChange={e => setNoticeForm({...noticeForm, content: e.target.value})}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-red-500"
              checked={noticeForm.important}
              onChange={e => setNoticeForm({...noticeForm, important: e.target.checked})}
            />
            <span className="text-red-600 font-bold">🔴 중요 공지</span>
          </label>
          <button
            onClick={handleSaveNotice}
            className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-bold text-sm transition"
          >
            등록하기
          </button>
        </div>
      </div>

      {/* 공지 목록 */}
      <div className="space-y-3">
        {notices.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border shadow-sm">
            <Megaphone size={40} className="mx-auto mb-2 opacity-30"/>
            <p>등록된 공지사항이 없습니다.</p>
          </div>
        ) : notices.map(n => (
          <div key={n.id} className={`bg-white rounded-xl border shadow-sm p-4 flex gap-3 ${n.important ? 'border-red-300 bg-red-50/30' : ''}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {n.important && <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">중요</span>}
                <span className="font-bold text-slate-800">{n.title}</span>
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{n.content}</p>
              <span className="text-xs text-slate-400 mt-1 block">{n.date}</span>
            </div>
            <button
              onClick={() => handleDeleteNotice(n.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition self-start"
            >
              <Trash2 size={15}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLoginScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
      {/* 공지사항 배너 (로그인 전 표시) */}
      {notices.length > 0 && (
        <div className="w-full max-w-sm mb-4 space-y-2">
          {notices.slice(0, 3).map(n => (
            <div key={n.id} className={`rounded-xl p-3 border flex gap-2 items-start shadow-sm text-sm ${n.important ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200'}`}>
              <Bell size={15} className={`mt-0.5 flex-shrink-0 ${n.important ? 'text-red-500' : 'text-yellow-500'}`}/>
              <div>
                {n.important && <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full mr-1">중요</span>}
                <span className="font-bold text-slate-800">{n.title}</span>
                <p className="text-slate-600 mt-0.5 text-xs whitespace-pre-wrap">{n.content}</p>
                <span className="text-xs text-slate-400">{n.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
        <ShieldAlert className="w-16 h-16 text-orange-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">위험물 저장소 관리</h1>
        <p className="text-slate-500 mb-4">접속 권한을 선택해주세요</p>
        
        {!firebaseInitialized ? (
            <div className="flex items-center justify-center gap-2 text-blue-600 py-4">
                <Cloud className="animate-bounce" size={20}/>
                <span className="text-sm font-bold">서버 연결 중...</span>
            </div>
        ) : (
            <div className="space-y-3">
            {isDemoMode && (
                <div className="bg-orange-100 text-orange-800 text-xs p-2 rounded mb-2 font-bold flex items-center justify-center gap-1">
                    <WifiOff size={14} /> 현재 오프라인 데모 모드입니다.
                </div>
            )}
            <button onClick={handleUserEntry} className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                <Users size={20} /> 실험실 사용자
            </button>
            <button onClick={() => setShowPasswordModal(true)} className="w-full py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-medium flex items-center justify-center gap-2">
                <Settings size={20} /> 관리자
            </button>
            </div>
        )}
      </div>
      
      {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Lock size={18} /> 관리자 암호 입력</h3>
                  <input type="password" placeholder="비밀번호" className="w-full border p-3 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-slate-500" autoFocus value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
                  <div className="flex gap-2">
                      <button onClick={handleAdminLogin} className="flex-1 bg-slate-700 text-white py-3 rounded hover:bg-slate-800 font-bold">확인</button>
                      <button onClick={() => { setShowPasswordModal(false); setPasswordInput(''); }} className="flex-1 bg-gray-200 text-gray-700 py-3 rounded hover:bg-gray-300 font-bold">취소</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );

  const NavItem = ({ tab, icon: Icon, label, badge }) => (
      <button onClick={() => navigateTo(tab)} className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between group transition ${activeTab === tab ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'hover:bg-slate-800 text-slate-300'}`}>
          <div className="flex items-center gap-3"><Icon size={18} className={activeTab === tab ? 'text-blue-400' : 'text-slate-400'}/> <span className="font-medium">{label}</span></div>
          {badge > 0 && <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{badge}</span>}
      </button>
  );

  const renderSidebar = () => (
    <>
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
      
      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white h-screen flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {currentUser === 'admin' ? <Settings className="text-blue-400"/> : <ShieldAlert className="text-orange-400"/>} 
              {currentUser === 'admin' ? 'Admin Mode' : 'User Mode'}
            </h2>
            <div className="flex items-center gap-1.5 mt-2 ml-1">
                <div className={`w-2 h-2 rounded-full ${firebaseInitialized ? (isDemoMode ? 'bg-orange-500' : networkState === 'offline' ? 'bg-red-500' : isRealtimePaused ? 'bg-amber-400' : 'bg-green-500') : 'bg-red-500'}`}></div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {firebaseInitialized ? (isDemoMode ? 'Offline Demo' : networkState === 'offline' ? 'Network Offline' : isRealtimePaused ? 'Sync Paused' : 'Realtime Sync') : 'Connecting...'}
                </span>
            </div>
            {!isDemoMode && currentUser && (
              <div className="mt-1 ml-1 text-[10px] text-slate-500">
                {networkState === 'offline'
                  ? '네트워크 오프라인 상태입니다.'
                  : isRealtimePaused
                    ? '탭이 비활성화되어 실시간 연결을 잠시 끊었습니다.'
                    : `마지막 동기화 ${formatSyncTime(lastSyncAt)}`}
              </div>
            )}
          </div>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}><X size={24}/></button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {currentUser === 'admin' ? (
            <>
              <NavItem tab="dashboard" icon={LayoutDashboard} label="대시보드" />
              <NavItem tab="notices" icon={Megaphone} label="공지사항 관리" badge={notices.filter(n=>n.important).length} />
              <NavItem tab="admin_inventory" icon={ClipboardList} label="재고 현황" />
              <NavItem tab="approvals" icon={CheckCircle} label="승인 대기/관리" badge={requestStatusSummary.pendingCount} />
              <NavItem tab="history" icon={ArrowRightLeft} label="반출입 기록 조회" />
              <NavItem tab="masterData" icon={Database} label="기초 데이터 관리" />
            </>
          ) : (
            <>
              <NavItem tab="request" icon={PackagePlus} label="반출/반입 신청" />
              <NavItem tab="my_requests" icon={History} label="신청 현황" />
              <NavItem tab="public_status" icon={LayoutDashboard} label="위험물 보관 현황" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition">
            <LogOut size={18} /> 로그아웃
          </button>
        </div>
      </div>
    </>
  );

  const renderRequestFormScreen = () => {
    const storages = ['제1공학관', '제1과학기술관', '동물실험동'].sort();
    const filteredLabs = labs.filter(l => l.storage === requestForm.storage).sort((a,b) => a.name.localeCompare(b.name, 'ko'));
    const filteredChemicals = requestForm.chemicalName
      ? chemicals.filter(chem => matchesChemicalKeyword(chem.name, requestForm.chemicalName)).sort((a,b) => a.name.localeCompare(b.name))
      : [...chemicals].sort((a,b) => a.name.localeCompare(b.name));

    return (
      <div className="max-w-3xl mx-auto bg-white p-4 md:p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="mb-6 border-b pb-4">
          <h2 className="text-2xl font-bold text-slate-800">위험물 반출/반입 신청서</h2>
          <p className="text-sm text-slate-500 mt-2">반출입 신청은 이제 개별 입력만 지원합니다. 반출입 예정일과 주요 물질 퀵버튼을 활용하면 더 빠르게 등록할 수 있습니다.</p>
        </div>
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Globe2 size={16} className="text-blue-600" /> Foreign student help</div>
              <p className="mt-1 text-xs text-slate-500">영문/중문 안내만 전환되며 실제 입력 항목은 동일합니다.</p>
            </div>
            <div className="inline-flex rounded-lg bg-white p-1 border shadow-sm">
              {Object.entries(EXPLANATION_COPY).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setUiLang(key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${uiLang === key ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-blue-100 bg-white px-4 py-3">
            <div className="text-sm font-bold text-slate-800">{EXPLANATION_COPY[uiLang].title}</div>
            <p className="mt-1 text-sm text-slate-600 leading-6">{EXPLANATION_COPY[uiLang].body}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">신청 유형</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                    {['IN', 'OUT'].map(t => (
                        <button key={t} onClick={() => setRequestForm({...requestForm, type: t})} className={`flex-1 py-2 rounded-md text-sm font-bold transition ${requestForm.type === t ? (t === 'IN' ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm') : 'bg-white text-slate-500 hover:text-slate-700'}`}>
                            {t === 'IN' ? '반입 (입고)' : '반출 (출고)'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">반출입 예정일</label>
                <input type="date" className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" value={requestForm.actionDate} onChange={(e) => setRequestForm({...requestForm, actionDate: e.target.value})} />
                <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => setRequestForm({...requestForm, actionDate: getTodayString()})} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200">오늘</button>
                    <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setRequestForm({...requestForm, actionDate: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}); }} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200">내일</button>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">저장소 선택</label>
                <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" value={requestForm.storage} onChange={(e) => setRequestForm({...requestForm, storage: e.target.value, labName: '', ext: ''})}>
                    <option value="">선택해주세요</option>
                    {storages.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">실험실 선택</label>
                <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100" value={requestForm.labName} onChange={(e) => { const lab = labs.find(l => l.name === e.target.value); setRequestForm({...requestForm, labName: e.target.value, ext: lab ? lab.ext : ''}); }} disabled={!requestForm.storage}>
                    <option value="">{requestForm.storage ? '실험실을 선택하세요' : '저장소를 먼저 선택하세요'}</option>
                    {filteredLabs.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">내선번호</label>
                <input type="text" className="border p-3 rounded-lg bg-slate-50 text-slate-500" value={requestForm.ext} readOnly placeholder="자동 입력됨" />
            </div>
        </div>

        <div className="space-y-4 mb-8">
             <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">자주 쓰는 물질 퀵버튼</label>
                <div className="flex flex-wrap gap-2">
                    {QUICK_CHEMICAL_BUTTONS.map(btn => {
                        const matched = btn.names.some(name => String(requestForm.chemicalName || '').toLowerCase() === String(name).toLowerCase());
                        return (
                            <button
                                key={btn.label}
                                type="button"
                                onClick={() => applyQuickChemical(btn.names)}
                                className={`px-3 py-2 rounded-full text-xs md:text-sm font-bold border transition ${matched ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'}`}
                            >
                                {btn.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-400">버튼을 누르면 물질명과 등록된 성상/CAS 정보가 자동으로 채워집니다.</p>
            </div>
             <div className="flex flex-col gap-2 relative">
                <label className="text-sm font-bold text-slate-700">물질명 검색</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                            placeholder="물질명 입력 또는 🔍 버튼으로 목록 검색 (한/영 자동 매칭)" 
                            value={requestForm.chemicalName} 
                            onChange={(e) => { setRequestForm({...requestForm, chemicalName: e.target.value}); setIsChemDropdownOpen(true); }}
                            onFocus={() => setIsChemDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setIsChemDropdownOpen(false), 200)}
                        />
                        {isChemDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto z-10">
                                {filteredChemicals.length > 0 ? filteredChemicals.map((chem) => (
                                    <button 
                                        key={chem.id || chem.name} 
                                        className="w-full text-left p-3 hover:bg-blue-50 text-sm border-b last:border-b-0 flex justify-between items-center"
                                        onMouseDown={(e) => { e.preventDefault(); setRequestForm({...requestForm, chemicalName: getPreferredChemicalLabel(chem.name), chemType: chem.type, cas: chem.cas}); setIsChemDropdownOpen(false); }}
                                    >
                                        <span className="font-bold text-slate-700">{getPreferredChemicalLabel(chem.name)}</span>
                                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{chem.type}</span>
                                    </button>
                                )) : (
                                    <div className="p-3 text-slate-400 text-sm text-center">검색 결과가 없습니다. 직접 입력하세요.</div>
                                )}
                            </div>
                        )}
                    </div>
                    <button className="bg-slate-800 text-white px-4 rounded-lg hover:bg-slate-900 flex items-center gap-1" onClick={() => setIsChemDropdownOpen(!isChemDropdownOpen)} title="물질 목록 열기"><Search size={16}/></button>
                </div>
            </div>
            {/* 입고 형태 선택 (병/캔/직접입력) */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">입고 형태</label>
                <div className="flex gap-2 flex-wrap">
                    {[
                        { label: '🍶 4L 병', size: 4, unit: '병' },
                        { label: '🥫 18L 캔', size: 18, unit: '캔' },
                        { label: '✏️ 직접 입력', size: 0, unit: '' },
                    ].map(opt => (
                        <button
                            key={opt.label}
                            type="button"
                            onClick={() => setRequestForm({...requestForm, bottleSize: opt.size, bottleUnit: opt.unit, bottleCount: '', amount: '', directSize: '', directCount: ''})}
                            className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-lg text-sm font-bold border-2 transition ${requestForm.bottleSize === opt.size && requestForm.bottleUnit === opt.unit ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 병/캔 수 입력 */}
            {requestForm.bottleSize > 0 ? (
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-700">
                        {requestForm.bottleUnit} 수 <span className="text-slate-400 font-normal text-xs">(1{requestForm.bottleUnit} = {requestForm.bottleSize}L)</span>
                    </label>
                    <input
                        type="number"
                        min="1"
                        className="border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder={`${requestForm.bottleUnit} 수를 입력하세요`}
                        value={requestForm.bottleCount}
                        onChange={(e) => setRequestForm({...requestForm, bottleCount: e.target.value, amount: String(requestForm.bottleSize * Number(e.target.value) || '')})}
                    />
                    {requestForm.bottleCount > 0 && (
                        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                            <span className="text-blue-600 font-bold text-sm">
                                {requestForm.bottleSize}L × {requestForm.bottleCount}{requestForm.bottleUnit} = <span className="text-lg">{requestForm.bottleSize * Number(requestForm.bottleCount)}L</span>
                            </span>
                        </div>
                    )}
                </div>
            ) : (
                /* ✏️ 직접 입력: 수량 × 갯수 형식 */
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-[1fr_24px_1fr] items-end gap-2">
                        {/* 좌: 1개당 용량 */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-600">1개당 용량</label>
                            <div className="flex gap-1">
                                <input
                                    type="number" min="0" step="0.1"
                                    className="border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none w-full min-w-0"
                                    placeholder="2.5"
                                    value={requestForm.directSize}
                                    onChange={e => {
                                        const sz = e.target.value;
                                        const cnt = Number(requestForm.directCount) || 0;
                                        setRequestForm({...requestForm, directSize: sz,
                                            amount: sz && cnt > 0 ? String(Number(sz) * cnt) : ''});
                                    }}
                                />
                                <select className="border p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 w-16 focus:outline-none flex-shrink-0"
                                    value={requestForm.unit}
                                    onChange={e => setRequestForm({...requestForm, unit: e.target.value})}>
                                    {['L','mL','kg','g'].map(u => <option key={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                        {/* 중: × */}
                        <div className="text-lg font-bold text-slate-400 text-center pb-2">×</div>
                        {/* 우: 갯수 */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-600">갯수</label>
                            <div className="flex gap-1">
                                <input
                                    type="number" min="1"
                                    className="border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none w-full min-w-0"
                                    placeholder="1"
                                    value={requestForm.directCount}
                                    onChange={e => {
                                        const cnt = e.target.value;
                                        const sz = Number(requestForm.directSize) || 0;
                                        setRequestForm({...requestForm, directCount: cnt,
                                            amount: cnt && sz > 0 ? String(sz * Number(cnt)) : ''});
                                    }}
                                />
                                <select className="border p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 w-16 focus:outline-none flex-shrink-0"
                                    value={requestForm.directUnit}
                                    onChange={e => setRequestForm({...requestForm, directUnit: e.target.value})}>
                                    {['병','캔','개','팩','박스'].map(u => <option key={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    {/* 계산 미리보기 */}
                    {Number(requestForm.directSize) > 0 && Number(requestForm.directCount) > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
                            <span className="text-blue-700 font-bold text-sm">
                                {requestForm.directSize}{requestForm.unit} × {requestForm.directCount}{requestForm.directUnit} = {Number(requestForm.directSize) * Number(requestForm.directCount)}{requestForm.unit}
                            </span>
                            <span className="text-xs text-blue-400">→ 연구자 화면: <b>{requestForm.directCount}{requestForm.directUnit}({Number(requestForm.directSize)*Number(requestForm.directCount)}{requestForm.unit})</b></span>
                        </div>
                    )}
                    {/* 총량 수동 입력 */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-600">총량 <span className="text-slate-400 font-normal">(위에서 자동계산 또는 직접 입력)</span></label>
                        <input type="number"
                            className="border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="총량"
                            value={requestForm.amount}
                            onChange={e => setRequestForm({...requestForm, amount: e.target.value})} />
                    </div>
                </div>
            )}
             <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">제조사</label>
                <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" value={requestForm.manufacturer} onChange={(e) => setRequestForm({...requestForm, manufacturer: e.target.value})}>
                    <option value="">선택해주세요</option>
                    {[...manufacturers].sort((a,b) => a.name.localeCompare(b.name, 'ko')).map((m) => (
                        <option key={m.id || m.name} value={m.name}>{m.name}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="flex flex-col gap-3">
          <button disabled={isSubmitting} onClick={() => submitRequest(false)} className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${requestForm.type === 'IN' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
            {isSubmitting ? '잠시만 기다려주세요...' : (requestForm.type === 'IN' ? '📦 반입 신청 완료 (내역으로 이동)' : '📤 반출 신청 완료 (내역으로 이동)')}
          </button>
          <button disabled={isSubmitting} onClick={() => submitRequest(true)} className={`w-full py-3 rounded-xl font-bold text-base border-2 transition transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${requestForm.type === 'IN' ? 'border-green-600 text-green-700 hover:bg-green-50' : 'border-red-600 text-red-700 hover:bg-red-50'} bg-white`}>
            {isSubmitting ? '저장 중...' : '➕ 이어서 다른 물질 신청 (저장소·실험실 유지)'}
          </button>
        </div>
      </div>
    );
  };

  const renderDashboardScreen = () => {
    const storages = ['제1과학기술관', '제1공학관', '동물실험동'];
    const currentStorageData = inventory.filter(i => i.storage === dashboardTab && Number(i.amount) > 0);
    
    const currentAmounts = {};
    currentStorageData.forEach(item => {
        const type = getResolvedChemicalType(item, chemicals) || '기타';
        if (!currentAmounts[type]) currentAmounts[type] = 0;
        currentAmounts[type] += Number(item.amount);
    });

    const rows = [
        { class: 'Ι', type: '특수인화물', designated: 50 },
        { class: 'Ⅱ', type: '1석유류(비)', designated: 200 },
        { class: '', type: '1석유류(수)', designated: 400 },
        { class: '', type: '알코올류', designated: 400 },
        { class: 'Ⅲ', type: '2석유류(비)', designated: 1000 },
        { class: '', type: '2석유류(수)', designated: 2000 },
        { class: '', type: '3석유류(비)', designated: 2000 },
        { class: '', type: '3석유류(수)', designated: 4000 },
        { class: 'Ⅳ', type: '4석유류', designated: 6000 },
        { class: '', type: '동식물유', designated: 10000 },
        { class: '화관법', type: '유독물질', designated: 0 },
        { class: '', type: '해당없음', designated: 0 },
    ];

    let totalLicensedMultiple = 0;
    let totalCurrentMultiple = 0;

    const tableData = rows.map(row => {
        const licensed = LICENSED_SPECS[dashboardTab]?.[row.type] || 0;
        const licensedMultiple = (row.designated > 0 && licensed > 0) ? (licensed / row.designated) : 0;
        const current = currentAmounts[row.type] || 0;
        const currentMultiple = (row.designated > 0 && current > 0) ? (current / row.designated) : 0;

        totalLicensedMultiple += licensedMultiple;
        totalCurrentMultiple += currentMultiple;

        return { ...row, licensed, licensedMultiple, current, currentMultiple };
    });

    // ✅ 합계 보유량 (단위 혼합 가능하므로 수치 합산)
    const totalCurrentAmount = tableData.reduce((sum, row) => sum + (row.current || 0), 0);

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">통합 대시보드</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-blue-500">
            <h3 className="text-slate-500 text-sm font-medium mb-1">총 보관 물질</h3>
            <p className="text-3xl font-bold text-slate-800">{inventory.length} <span className="text-sm font-normal text-slate-400">건</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-orange-500">
             <h3 className="text-slate-500 text-sm font-medium mb-1">승인 대기</h3>
             <p className="text-3xl font-bold text-orange-600">{requestStatusSummary.pendingCount} <span className="text-sm font-normal text-slate-400">건</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-green-500">
             <h3 className="text-slate-500 text-sm font-medium mb-1">등록 실험실</h3>
             <p className="text-3xl font-bold text-slate-800">{labs.length} <span className="text-sm font-normal text-slate-400">곳</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50">
                {storages.map(storage => (
                    <button
                        key={storage}
                        onClick={() => setDashboardTab(storage)}
                        className={`flex-1 py-4 text-sm font-bold text-center transition ${
                            dashboardTab === storage 
                            ? 'bg-white text-blue-600 border-t-2 border-t-blue-600' 
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                    >
                        {storage}
                    </button>
                ))}
            </div>

            <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Database className="text-blue-600" size={20}/> {dashboardTab} 실시간 현황표
                    </h3>
                    <div className="mt-2 md:mt-0 px-4 py-2 bg-slate-100 rounded-lg flex items-center gap-2">
                        <span className="text-sm text-slate-600 font-bold">총 보유 배수:</span>
                        <span className={`text-lg font-bold ${totalCurrentMultiple >= 1 ? 'text-red-600' : 'text-green-600'}`}>
                            {totalCurrentMultiple.toFixed(3)} 배
                        </span>
                        {totalCurrentMultiple >= 1 && <AlertTriangle size={18} className="text-red-600" />}
                    </div>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-700 border-b font-bold">
                            <tr>
                                <th className="p-3 border-r text-center w-16">구분</th>
                                <th className="p-3 border-r text-center">품명</th>
                                <th className="p-3 border-r text-right">지정수량</th>
                                <th className="p-3 border-r text-right">허가량</th>
                                <th className="p-3 border-r text-right">허가배수</th>
                                <th className="p-3 border-r text-right">보유량</th>
                                <th className="p-3 text-right">보유배수</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {tableData.map((row) => (
                                <tr key={row.type} className="hover:bg-slate-50">
                                    <td className="p-3 border-r text-center font-bold">{row.class}</td>
                                    <td className="p-3 border-r text-center">{row.type}</td>
                                    <td className="p-3 border-r text-right text-slate-500">{row.designated > 0 ? row.designated.toLocaleString() : ''}</td>
                                    <td className="p-3 border-r text-right">{row.licensed > 0 ? row.licensed.toLocaleString() : ''}</td>
                                    <td className="p-3 border-r text-right">{row.licensedMultiple > 0 ? row.licensedMultiple.toFixed(2) : ''}</td>
                                    <td className="p-3 border-r text-right font-bold text-blue-600">{row.current > 0 ? row.current.toLocaleString() : '0'}</td>
                                    <td className={`p-3 text-right font-bold ${row.currentMultiple > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                                        {row.currentMultiple > 0 ? row.currentMultiple.toFixed(4) : '0'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t font-bold text-slate-800">
                            <tr>
                                <td colSpan="4" className="p-3 border-r text-center">합계</td>
                                <td className="p-3 border-r text-right">{totalLicensedMultiple.toFixed(2)}</td>
                                <td className="p-3 border-r text-right font-bold text-blue-600">{totalCurrentAmount.toLocaleString()}</td>
                                <td className={`p-3 text-right ${totalCurrentMultiple >= 1 ? 'text-red-600' : 'text-green-600'}`}>
                                    {totalCurrentMultiple.toFixed(4)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
      </div>
    );
  };

  const renderAdminInventoryScreen = () => {
    const allStorages = [...new Set(inventory.map(i => i.storage).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
    const allLabs = [...new Set(inventory.filter(i => invFilter.storage === 'All' || i.storage === invFilter.storage).map(i => i.labName).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
    const allChemTypes = [...new Set(inventory.map(i => getResolvedChemicalType(i, chemicals)).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
    const allManufacturers = [...new Set(inventory.map(i => getManufacturerName(i.manufacturer)).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));

    const filteredInv = inventory.filter(i => {
      const activeAmount = Number(i.amount) > 0;
      const matchStorage = invFilter.storage === 'All' || i.storage === invFilter.storage;
      const matchLab = invFilter.labName === 'All' || i.labName === invFilter.labName;
      const matchManufacturer = invFilter.manufacturer === 'All' || getManufacturerName(i.manufacturer) === invFilter.manufacturer;
      const matchChemical = !chemNameDebounced || matchesChemicalKeyword(i.chemicalName, chemNameDebounced);
      const chemType = getResolvedChemicalType(i, chemicals);
      const matchType = invFilter.chemType === 'All' || chemType === invFilter.chemType;
      return activeAmount && matchStorage && matchLab && matchManufacturer && matchChemical && matchType;
    }).sort((a,b) => {
      const dir = invSort.dir === 'asc' ? 1 : -1;
      const key = invSort.key;
      const getVal = item => String(item[key] || '');
      return getVal(a).localeCompare(getVal(b), 'ko', {numeric: true}) * dir;
    });

    const filteredTotalAmount = filteredInv.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const filteredLabCount = new Set(filteredInv.map(item => item.labName).filter(Boolean)).size;
    const filteredChemCount = new Set(filteredInv.map(item => item.chemicalName).filter(Boolean)).size;

    const toggleSort = (key) => setInvSort(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    const sortIcon = (key) => invSort.key === key ? (invSort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
    const resetInventoryFilter = () => setInvFilter({ storage: 'All', labName: 'All', manufacturer: 'All', chemicalName: '', chemType: 'All' });

    const downloadInventoryCSV = () => {
      const header = "저장소,실험실,선반,물질명,CAS No.,성상,수량,단위,병/캔정보,제조사,최근보정일,보정차이,보정사유,최근수정일,수정사유\n";
      const rows = filteredInv.map(i => {
        const chem = chemicals.find(c => c.name === i.chemicalName);
        const cas = (chem ? chem.cas : i.cas) || '-';
        const ct = getResolvedChemicalType(i, chemicals);
        const bottleInfo = (i.bottleSize > 0 && i.bottleUnit && Number(i.amount) > 0)
          ? `${i.bottleCount && Number(i.bottleCount)>0 ? Number(i.bottleCount) : Math.round(Number(i.amount)/i.bottleSize)}${i.bottleUnit}(${i.amount}L)` : '-';
        return [
          csvEscapeText(i.storage), csvEscapeText(i.labName), csvEscapeText(i.shelf||'미지정'), csvEscapeText(i.chemicalName), csvEscapeExcelText(cas), csvEscapeText(ct), csvEscapeNumber(i.amount), csvEscapeText(i.unit), csvEscapeText(bottleInfo), csvEscapeText(getManufacturerName(i.manufacturer)),
          csvEscapeText(formatAdminDateTime(i.lastAdjustedAt)), csvEscapeNumber(i.lastAdjustedDelta), csvEscapeText(i.lastAdjustedReason || '-'), csvEscapeText(formatAdminDateTime(i.lastEditedAt)), csvEscapeText(i.lastEditReason || '-')
        ].join(',');
      }).join("\n");
      const summary = invExportIncludeSummary
        ? `

요약,검색건수,${filteredInv.length}
요약,총량(L),${filteredTotalAmount.toFixed(2)}
요약,실험실수,${filteredLabCount}
요약,물질수,${filteredChemCount}`
        : '';
      downloadCSV(header + rows + summary, `재고현황_${getTodayString()}.csv`);
    };

    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" /> 재고 현황
          </h2>
          <button
            onClick={downloadInventoryCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition">
            <Download size={16}/> 재고 현황 CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-bold text-blue-700">필터 결과 수량 합계</div>
            <div className="mt-1 text-2xl font-bold text-blue-600">{filteredTotalAmount.toFixed(2)}L</div>
            <div className="mt-1 text-xs text-blue-500">현재 조건으로 합산된 전체 재고량</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold text-slate-500">항목 수</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{filteredInv.length}</div>
            <div className="mt-1 text-xs text-slate-400">필터에 맞는 재고 행 수</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold text-slate-500">실험실 수</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{filteredLabCount}</div>
            <div className="mt-1 text-xs text-slate-400">포함된 실험실 개수</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold text-slate-500">물질 수</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{filteredChemCount}</div>
            <div className="mt-1 text-xs text-slate-400">포함된 물질 종류</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">저장소</label>
              <select className="border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
                value={invFilter.storage}
                onChange={e => setInvFilter(f => ({...f, storage: e.target.value, labName: 'All'}))}>
                <option value="All">전체 저장소</option>
                {allStorages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">실험실</label>
              <select className="border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
                value={invFilter.labName}
                onChange={e => setInvFilter(f => ({...f, labName: e.target.value}))}>
                <option value="All">전체 실험실</option>
                {allLabs.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">제조사</label>
              <select className="border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
                value={invFilter.manufacturer}
                onChange={e => setInvFilter(f => ({...f, manufacturer: e.target.value}))}>
                <option value="All">전체 제조사</option>
                {allManufacturers.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">물질명</label>
              <input
                type="text"
                value={invFilter.chemicalName}
                onChange={e => setInvFilter(f => ({...f, chemicalName: e.target.value}))}
                className="border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="한글/영문 검색"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">성상</label>
              <select
                className="border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
                value={invFilter.chemType}
                onChange={e => setInvFilter(f => ({...f, chemType: e.target.value}))}>
                <option value="All">전체 성상</option>
                {allChemTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t">
            <div className="space-y-1">
              <p className="text-sm text-slate-500">검색 결과: <strong className="text-slate-800">{filteredInv.length}건</strong> · 총량 <strong className="text-blue-700">{filteredTotalAmount.toFixed(2)}L</strong></p>
              <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={invExportIncludeSummary} onChange={e => setInvExportIncludeSummary(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                CSV에 필터 합계/건수 요약 함께 내보내기
              </label>
            </div>
            <button
              type="button"
              onClick={resetInventoryFilter}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-slate-50 text-slate-600 text-sm font-bold hover:bg-slate-100">
              <RotateCcw size={14}/> 필터 초기화
            </button>
          </div>
        </div>

        <div className="md:hidden space-y-3">
          {filteredInv.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-slate-400">해당 조건의 재고가 없습니다.</div>
          ) : filteredInv.map((item) => {
            const chem = chemicals.find(c => c.name === item.chemicalName);
            const cas = (chem ? chem.cas : item.cas) || '-';
            const ct = getResolvedChemicalType(item, chemicals);
            return (
              <div key={item.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800">{item.chemicalName}</div>
                    <div className="text-xs text-slate-500 mt-1">{item.storage} · {item.labName}</div>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">{ct}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">선반</div><div className="font-bold text-blue-700">{item.shelf || '미지정'}</div></div>
                  <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">CAS</div><div className="font-mono text-xs text-slate-600">{cas}</div></div>
                  <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">수량</div><div className="font-bold text-blue-700">{item.amount}{item.unit || 'L'}</div></div>
                  <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">제조사</div><div className="text-slate-600 truncate">{item.manufacturer || '-'}</div></div>
                </div>
                {item.lastAdjustedAt && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    최근 보정: {formatAdminDateTime(item.lastAdjustedAt)} · {item.lastAdjustedDelta > 0 ? '+' : ''}{item.lastAdjustedDelta || 0}{item.unit || 'L'}
                  </div>
                )}
                {item.lastEditedAt && (
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    최근 정보 수정: {formatAdminDateTime(item.lastEditedAt)} · {item.lastEditReason || '-'}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => openInventoryEditModal(item)}
                    className="text-sm px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition font-bold flex items-center justify-center gap-1"
                    title="재고 정보 수정"
                  >
                    <Edit2 size={14}/> 정보 수정
                  </button>
                  <button
                    onClick={() => setInvEditModal({ ...item })}
                    className="text-sm px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition font-bold flex items-center justify-center gap-1"
                    title="병/캔 단위 설정"
                  >
                    <PackagePlus size={14}/> {item.bottleSize > 0 && item.bottleUnit ? `${item.bottleSize}${item.unit || 'L'} ${item.bottleUnit}` : '용기 설정'}
                  </button>
                  <button
                    onClick={() => openInventoryAdjustModal(item)}
                    className="text-sm px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition font-bold flex items-center justify-center gap-1"
                    title="재고 보정"
                  >
                    <RotateCcw size={14}/> 재고 보정
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block bg-white rounded-xl shadow border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[980px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {[
                    {label:'저장소', key:'storage'},
                    {label:'실험실', key:'labName'},
                    {label:'선반',   key:'shelf'},
                    {label:'물질명', key:'chemicalName'},
                    {label:'CAS No.', key:null},
                    {label:'성상',   key:null},
                    {label:'수량',   key:null},
                    {label:'단위',   key:null},
                    {label:'제조사', key:null},
                    {label:'최근 보정', key:null},
                    {label:'관리', key:null},
                  ].map(({label, key}) => (
                    <th key={label}
                      className={`p-3 text-xs font-bold text-slate-500 tracking-wider whitespace-nowrap select-none ${key ? 'cursor-pointer hover:bg-slate-100 transition' : ''}`}
                      onClick={key ? () => toggleSort(key) : undefined}>
                      {label}{key ? sortIcon(key) : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInv.length === 0 ? (
                  <tr><td colSpan={11} className="p-8 text-center text-slate-400">해당 조건의 재고가 없습니다.</td></tr>
                ) : filteredInv.map((item) => {
                  const chem = chemicals.find(c => c.name === item.chemicalName);
                  const cas = (chem ? chem.cas : item.cas) || '-';
                  const ct = getResolvedChemicalType(item, chemicals);
                  return (
                    <tr key={item.id} className="hover:bg-blue-50 transition">
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{item.storage}</td>
                      <td className="p-3 font-medium text-slate-800 whitespace-nowrap">{item.labName}</td>
                      <td className="p-3 text-blue-600 font-bold whitespace-nowrap">{item.shelf || '미지정'}</td>
                      <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{item.chemicalName}</td>
                      <td className="p-3 text-xs text-slate-400 whitespace-nowrap font-mono">{cas}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{ct}</span>
                      </td>
                      <td className="p-3 font-bold text-right text-blue-700 whitespace-nowrap">
                        <div>{item.amount}{item.unit || 'L'}</div>
                        {item.bottleSize > 0 && item.bottleUnit && <div className="text-xs text-slate-400 font-normal">{Math.round(item.amount/item.bottleSize)}{item.bottleUnit}</div>}
                      </td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{item.unit}</td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">{getManufacturerName(item.manufacturer) || '-'}</td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        <div className="space-y-1">
                          {item.lastAdjustedAt ? (
                            <div>
                              <div className="font-bold text-emerald-700">보정 {formatAdminDateTime(item.lastAdjustedAt)}</div>
                              <div className="text-slate-400">{item.lastAdjustedDelta > 0 ? '+' : ''}{item.lastAdjustedDelta || 0}{item.unit || 'L'} · {item.lastAdjustedReason || '-'}</div>
                            </div>
                          ) : null}
                          {item.lastEditedAt ? (
                            <div>
                              <div className="font-bold text-amber-700">수정 {formatAdminDateTime(item.lastEditedAt)}</div>
                              <div className="text-slate-400">{item.lastEditReason || '-'}</div>
                            </div>
                          ) : null}
                          {!item.lastAdjustedAt && !item.lastEditedAt && <span className="text-slate-300">-</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openInventoryEditModal(item)}
                            className="text-xs px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition font-bold flex items-center gap-1"
                            title="재고 정보 수정"
                          >
                            <Edit2 size={12}/> 정보
                          </button>
                          <button
                            onClick={() => setInvEditModal({ ...item })}
                            className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition font-bold flex items-center gap-1"
                            title="병/캔 단위 설정"
                          >
                            <PackagePlus size={12}/> 용기
                          </button>
                          <button
                            onClick={() => openInventoryAdjustModal(item)}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition font-bold flex items-center gap-1"
                            title="재고 불일치 빠른 보정"
                          >
                            <RotateCcw size={12}/> 보정
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderStorageStatusScreen = () => {
    const filterStorage = historyFilter.statusStorage || 'All';
    const setFilterStorage = (val) => setHistoryFilter({...historyFilter, statusStorage: val});

    const filteredInventory = inventory.filter(i => Number(i.amount) > 0 && (filterStorage === 'All' || i.storage === filterStorage));
    const totalAmount = filteredInventory.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalChemicals = new Set(filteredInventory.map(item => item.chemicalName).filter(Boolean)).size;
    const totalLabs = new Set(filteredInventory.map(item => item.labName).filter(Boolean)).size;
    const labGrouped = [...new Set(filteredInventory.map(i => i.labName).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));

    return (
      <div className="space-y-4 md:space-y-6">
         <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><FlaskConical className="text-blue-600" /> 위험물 보관 현황</h2>
         <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2 w-full md:w-auto">
                <Filter size={18} className="text-slate-500"/>
                <select className="border p-2 rounded flex-1 md:flex-none" value={filterStorage} onChange={e => setFilterStorage(e.target.value)}>
                    <option value="All">전체 저장소</option>
                    {publicStatusStorageOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-bold text-blue-700">총 보관량</div>
              <div className="mt-1 text-2xl font-bold text-blue-700">{totalAmount.toFixed(2)}L</div>
              <div className="mt-1 text-xs text-blue-500">선택한 저장소 기준 합계</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold text-slate-500">물질 종류</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">{totalChemicals}</div>
              <div className="mt-1 text-xs text-slate-400">중복 제외 물질 수</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold text-slate-500">실험실 수</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">{totalLabs}</div>
              <div className="mt-1 text-xs text-slate-400">현재 조건에 포함된 실험실</div>
            </div>
         </div>

         <div className="bg-white rounded-xl shadow border overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
              <h3 className="text-lg font-bold text-slate-700">🧪 실험실별 전체 보기</h3>
              <span className="text-xs text-slate-500">실험실을 누르면 선반/제조사까지 확인할 수 있습니다.</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-2">
              {labGrouped.length === 0 ? (
                <div className="p-8 text-center text-slate-400">표시할 재고가 없습니다.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {labGrouped.map((lab) => {
                    const labItems = filteredInventory.filter(i => i.labName === lab);
                    const labTotal = labItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
                    return (
                      <li key={lab} className="p-4 hover:bg-slate-50 flex justify-between items-center cursor-pointer gap-3" onClick={() => setSelectedLabDetail({ labName: lab, sortKey: 'shelf', sortDir: 'asc', items: labItems })}>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-700 truncate mr-2">{lab}</div>
                          <div className="text-xs text-slate-400 mt-1">{labItems.length}건 · {labTotal.toFixed(2)}L</div>
                        </div>
                        <button className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold flex-shrink-0">보유 목록</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
         </div>

         {selectedLabDetail && (
             <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLabDetail(null)}>
                 <div className="bg-white p-4 md:p-6 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                     <h3 className="text-lg md:text-xl font-bold text-slate-800 border-b pb-3">{selectedLabDetail.labName} 보유품목</h3>
                     <div className="flex gap-2 mt-2 mb-1 px-1">
                       <button onClick={() => setSelectedLabDetail(prev => ({...prev, sortKey: 'shelf', sortDir: prev.sortKey==='shelf'?(prev.sortDir==='asc'?'desc':'asc'):'asc'}))}
                         className={`text-xs px-2 py-1 rounded border ${selectedLabDetail.sortKey==='shelf'?'bg-blue-50 border-blue-300 text-blue-700 font-bold':'border-slate-200 text-slate-500'}`}>
                         선반 {selectedLabDetail.sortKey==='shelf'?(selectedLabDetail.sortDir==='asc'?'▲':'▼'):'⇅'}
                       </button>
                       <button onClick={() => setSelectedLabDetail(prev => ({...prev, sortKey: 'chemicalName', sortDir: prev.sortKey==='chemicalName'?(prev.sortDir==='asc'?'desc':'asc'):'asc'}))}
                         className={`text-xs px-2 py-1 rounded border ${selectedLabDetail.sortKey==='chemicalName'?'bg-blue-50 border-blue-300 text-blue-700 font-bold':'border-slate-200 text-slate-500'}`}>
                         물질명 {selectedLabDetail.sortKey==='chemicalName'?(selectedLabDetail.sortDir==='asc'?'▲':'▼'):'⇅'}
                       </button>
                     </div>
                     <div className="flex-1 overflow-y-auto mt-1">
                       <table className="w-full text-sm text-left hidden md:table">
                         <thead className="bg-slate-50 sticky top-0 border-b">
                           <tr>
                             <th className="p-2 w-16 whitespace-nowrap text-slate-600">선반</th>
                             <th className="p-2 text-slate-600">물질명 / 제조사</th>
                             <th className="p-2 text-right whitespace-nowrap text-slate-600">수량</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y">
                           {[...selectedLabDetail.items].sort((a,b)=>{
                             const k=selectedLabDetail.sortKey||'shelf', d=selectedLabDetail.sortDir==='desc'?-1:1;
                             return d*(a[k]||'').toString().localeCompare((b[k]||'').toString(),'ko',{numeric:true});
                           }).map((item)=>(
                             <tr key={item.id} className="hover:bg-slate-50">
                               <td className="p-2 font-bold text-blue-600 whitespace-nowrap">{item.shelf}</td>
                               <td className="p-2"><div className="font-bold">{item.chemicalName}</div><div className="text-xs text-slate-500">{item.manufacturer}</div></td>
                               <td className="p-2 text-right font-medium whitespace-nowrap">{formatBottleDisplay(item.amount, item.unit, item.bottleSize, item.bottleUnit, item.bottleCount)}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                       <div className="md:hidden space-y-2 pb-2">
                         {[...selectedLabDetail.items].sort((a,b)=>{
                           const k=selectedLabDetail.sortKey||'shelf', d=selectedLabDetail.sortDir==='desc'?-1:1;
                           return d*(a[k]||'').toString().localeCompare((b[k]||'').toString(),'ko',{numeric:true});
                         }).map((item)=>(
                           <div key={item.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-2.5">
                             <div className="flex items-center gap-2 flex-1 min-w-0">
                               <div className="text-sm font-bold text-blue-600 w-12 flex-shrink-0">{item.shelf}</div>
                               <div className="min-w-0">
                                 <div className="font-bold text-slate-700 truncate">{item.chemicalName}</div>
                                 <div className="text-xs text-slate-500 truncate">{item.manufacturer}</div>
                               </div>
                             </div>
                             <div className="text-sm font-bold text-orange-600 flex-shrink-0">{formatBottleDisplay(item.amount, item.unit, item.bottleSize, item.bottleUnit, item.bottleCount)}</div>
                           </div>
                         ))}
                       </div>
                     </div>
                     <button onClick={() => setSelectedLabDetail(null)} className="mt-4 w-full py-3 bg-slate-800 text-white rounded-lg font-bold">닫기</button>
                 </div>
             </div>
         )}
      </div>
    );
  };

  const renderSafetyStatusScreen = () => {
    const stats = {};
    const breakdownData = {}; 

    inventory.filter(i => Number(i.amount) > 0).forEach(item => { // ✅ amount=0 항목 제외
        const key = item.storage || '미지정';
        const typeKey = getResolvedChemicalType(item, chemicals) || '미분류';
        if (!stats[key]) stats[key] = {};
        if (!stats[key][typeKey]) stats[key][typeKey] = 0;
        stats[key][typeKey] += Number(item.amount);

        if (!breakdownData[key]) breakdownData[key] = {};
        if (!breakdownData[key][typeKey]) breakdownData[key][typeKey] = [];
        breakdownData[key][typeKey].push({ name: item.chemicalName, lab: item.labName, amount: item.amount, unit: item.unit });
    });

    const toggleExpand = (storage, type) => {
        const id = `${storage}_${type}`;
        setExpandedStats(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-4"><BarChart3 className="text-red-600" /> 성상별 보관 통계</h2>
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm mb-6 flex items-start gap-2 border border-blue-200">
                    <Info size={18} className="mt-0.5 flex-shrink-0"/>
                    <p>리스트를 터치하면 <strong>어느 실험실의 어떤 물질이 더해져서 계산되었는지 상세 내역</strong>을 볼 수 있습니다.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.keys(stats).sort((a,b) => a.localeCompare(b,'ko')).map(storageName => (
                        <div key={storageName} className="bg-white rounded-xl shadow border overflow-hidden">
                            <h3 className="bg-slate-800 text-white p-4 font-bold">{storageName}</h3>
                            <div className="p-2">
                                {Object.keys(stats[storageName]).sort((a,b) => a.localeCompare(b,'ko')).map(type => {
                                    const id = `${storageName}_${type}`;
                                    const isExpanded = expandedStats[id];
                                    return (
                                        <div key={type} className="border-b last:border-0">
                                            <button onClick={() => toggleExpand(storageName, type)} className="w-full py-3 px-2 flex justify-between items-center hover:bg-slate-50 transition">
                                                <span className="font-medium text-slate-700 text-left">{type}</span>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{stats[storageName][type].toLocaleString()} L</span>
                                                    {isExpanded ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="bg-slate-50 p-3 text-sm border-t border-slate-100 space-y-2">
                                                    <p className="text-xs font-bold text-slate-400 mb-2">용량 구성 상세내역:</p>
                                                    {[...breakdownData[storageName][type]].sort((a,b) => (a.name||'').localeCompare(b.name||'','ko')).map((detail) => (
                                                        <div key={`${detail.name}_${detail.lab}`} className="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-slate-100">
                                                            <div className="flex flex-col min-w-0 pr-2">
                                                                <span className="font-bold text-slate-700 truncate">{detail.name}</span>
                                                                <span className="text-xs text-slate-500 truncate">{detail.lab}</span>
                                                            </div>
                                                            <span className="font-bold text-orange-600 flex-shrink-0">{detail.amount}{detail.unit}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  };

  // 승인화면 Firebase 저장 헬퍼
  const saveEditedRequest = async (updated) => {
    const normalizedAmount = Number(updated.amount);
    if (!updated.chemicalName?.trim()) {
      showAlert("오류", "물질명을 입력해주세요.");
      return;
    }
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      showAlert("오류", "수량은 0보다 큰 숫자여야 합니다.");
      return;
    }

    const normalized = {
      ...updated,
      chemicalName: String(updated.chemicalName || '').trim(),
      manufacturer: String(updated.manufacturer || '').trim(),
      amount: normalizedAmount,
      shelf: updated.shelf || '미지정',
      chemType: normalizeChemicalType(updated.chemType) || getResolvedChemicalType(updated, chemicals),
    };

    const requested = getRequestedAllocations(normalized);
    const invalidLegacyLines = requested.invalidLines || [];
    const invalidRows = requested.invalidRows || [];
    if (invalidRows.length > 0 || invalidLegacyLines.length > 0) {
      const detail = invalidRows.length > 0 ? `행 ${invalidRows.join(', ')}` : invalidLegacyLines.join(', ');
      showAlert("오류", `선반 분할 입력 형식이 올바르지 않습니다.
문제 항목: ${detail}`);
      return;
    }

    const allocations = requested.allocations || [];
    if (allocations.length > 0) {
      const totalAllocated = allocations.reduce((sum, item) => sum + Number(item.amount), 0);
      if (Math.abs(totalAllocated - normalizedAmount) > 0.000001) {
        showAlert("오류", `선반 분할 합계(${totalAllocated}${normalized.unit || 'L'})가 총 수량(${normalizedAmount}${normalized.unit || 'L'})과 다릅니다.`);
        return;
      }
      normalized.shelfAllocations = allocations;
      normalized.shelf = allocations.map(item => item.shelf).join(', ');
    } else {
      delete normalized.shelfAllocations;
    }

    delete normalized.shelfAllocationRows;
    delete normalized.shelfAllocationText;

    if (isDemoMode) {
      setRequests(prev => prev.map(r => r.id === normalized.id ? normalized : r));
      setEditingRequest(null);
      showAlert("완료", "신청 내역이 수정되었습니다.");
      return;
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', normalized.id), normalized);
      setRequests(prev => prev.map(r => r.id === normalized.id ? normalized : r));
      setEditingRequest(null);
      showAlert("완료", "신청 내역이 수정되었습니다.");
    } catch(e) {
      showAlert("오류", "수정 저장 실패");
    }
  };



  // ── 공지사항 CRUD ──
  const handleSaveNotice = async () => {
    if (!noticeForm.title.trim() || !noticeForm.content.trim()) {
      showAlert('안내', '제목과 내용을 입력해주세요.');
      return;
    }
    const newNotice = {
      title: noticeForm.title.trim(),
      content: noticeForm.content.trim(),
      important: noticeForm.important,
      createdAt: Date.now(),
      date: getTodayString(),
    };
    if (isDemoMode) {
      setNotices(prev => sortNoticeItems([{ ...newNotice, id: String(Date.now()) }, ...prev]));
    } else {
      try {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notices'), newNotice);
        setNotices(prev => sortNoticeItems([{ ...newNotice, id: docRef.id }, ...prev]));
        noticesLoadedRef.current = true;
      } catch(e) { showAlert('오류', '저장 실패'); return; }
    }
    setNoticeForm({ title: '', content: '', important: false });
    showAlert('완료', '공지사항이 등록되었습니다.');
  };

  const handleDeleteNotice = (id) => {
    showConfirm('삭제', '공지사항을 삭제하시겠습니까?', async () => {
      if (isDemoMode) {
        setNotices(prev => prev.filter(n => n.id !== id));
        return;
      }
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notices', id));
        setNotices(prev => prev.filter(n => n.id !== id));
        noticesLoadedRef.current = true;
      } catch(e) { showAlert('오류', '삭제 실패'); }
    });
  };

  const renderApprovalScreen = () => {
    const pendingReqs = requestStatusSummary.pendingReqs;
    const allReqs = requests;
    // approvalViewTab은 이제 컴포넌트 레벨 state 사용 (훅 위반 수정)
    const displayReqs = (approvalViewTab === 'pending' ? pendingReqs : allReqs)
      .slice()
      .sort((a, b) => String(b.actionDate || '').localeCompare(String(a.actionDate || '')) || ((b.createdAt || 0) - (a.createdAt || 0)));
    const approvedCount = requestStatusSummary.approvedCount;
    const rejectedCount = requestStatusSummary.rejectedCount;
    const allocationDraftRows = editingRequest ? getEditableAllocationRows(editingRequest) : [];
    const allocationKeyword = allocationDraftRows.find(row => String(row.shelf || '').trim())?.shelf || (editingRequest?.shelf === '미지정' ? '' : (editingRequest?.shelf || ''));
    const shelfSuggestions = editingRequest
      ? getSuggestedShelves(editingRequest.storage, editingRequest.labName, allocationKeyword)
      : [];
    const editingFilteredChemicals = editingRequest?.chemicalName
      ? chemicals.filter(chem => matchesChemicalKeyword(chem.name, editingRequest.chemicalName)).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'))
      : [...chemicals].sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
    const allocationDraftTotal = allocationDraftRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const allocationDraftRemaining = (Number(editingRequest?.amount) || 0) - allocationDraftTotal;

    return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">승인 대기 / 관리</h2>
          <p className="text-sm text-slate-500 mt-1">승인 대기 항목은 실시간으로 갱신되고, 완료/반려 항목은 전체 내역 탭에서 최근 30일 범위만 불러옵니다.</p>
        </div>
        <button onClick={() => loadRequestsOnce({ force: true, includeRecent: approvalViewTab === 'all' })} className="self-start px-3 py-2 rounded-lg border bg-white text-slate-700 font-bold text-sm hover:bg-slate-50 flex items-center gap-2">
          <RotateCcw size={14}/> {isRequestsLoading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      {/* 탭 전환 */}
      <div className="flex gap-2">
        <button onClick={() => setApprovalViewTab('pending')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${approvalViewTab === 'pending' ? 'bg-orange-500 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
          대기 중 <span className="ml-1 bg-white text-orange-500 px-1.5 py-0.5 rounded-full text-xs font-bold">{pendingReqs.length}</span>
        </button>
        <button onClick={() => setApprovalViewTab('all')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${approvalViewTab === 'all' ? 'bg-slate-700 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
          전체 내역
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="text-xs font-bold text-orange-700">승인 대기</div>
          <div className="mt-1 text-2xl font-bold text-orange-600">{pendingReqs.length}</div>
          <div className="text-xs text-orange-500 mt-1">오늘 우선 확인이 필요한 건수</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs font-bold text-blue-700">승인 완료</div>
          <div className="mt-1 text-2xl font-bold text-blue-600">{approvedCount}</div>
          <div className="text-xs text-blue-500 mt-1">재고 반영까지 끝난 신청</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs font-bold text-rose-700">반려</div>
          <div className="mt-1 text-2xl font-bold text-rose-600">{rejectedCount}</div>
          <div className="text-xs text-rose-500 mt-1">검토 후 반려된 신청</div>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {displayReqs.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-500">항목이 없습니다.</div>
        ) : displayReqs.map(req => (
          <div key={req.id} className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${req.status === 'PENDING' ? 'border-blue-200' : req.status === 'APPROVED' ? 'border-green-200' : 'border-rose-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${req.type === 'IN' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{req.type === 'IN' ? '반입' : '반출'}</span>
                  {req.inventoryLocked && <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-100 text-amber-700">재고 유지 편집</span>}
                </div>
                <div className="mt-2 font-bold text-slate-800">{req.chemicalName}</div>
                <div className="text-xs text-slate-500 mt-1">{req.storage} · {req.labName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-700">{req.actionDate || req.date || '-'}</div>
                <div className="mt-2">
                  {req.status === 'PENDING' && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">대기중</span>}
                  {req.status === 'APPROVED' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">승인됨</span>}
                  {req.status === 'REJECTED' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">반려됨</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">수량</div><div className="font-bold text-blue-700">{formatBottleDisplay(req.amount, req.unit, req.bottleSize, req.bottleUnit, req.bottleCount, true)}</div></div>
              <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">내선</div><div className="text-slate-700">{req.ext || '-'}</div></div>
              <div className="rounded-lg bg-slate-50 p-2 col-span-2"><div className="text-[11px] text-slate-400">제조사 / 선반</div><div className="text-slate-700">{req.manufacturer || '-'} · {getRequestShelfDisplay(req)}</div></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {req.status === 'PENDING' && <>
                <button onClick={() => setEditingRequest(toEditableRequest(req))} className="flex-1 min-w-[90px] px-3 py-2 rounded-lg bg-blue-100 text-blue-700 font-bold text-sm">수정</button>
                <button onClick={() => approveRequest(req)} className="flex-1 min-w-[90px] px-3 py-2 rounded-lg bg-green-600 text-white font-bold text-sm">{req.inventoryLocked ? '승인(재고 유지)' : '승인'}</button>
                <button onClick={() => rejectRequest(req.id)} className="flex-1 min-w-[90px] px-3 py-2 rounded-lg bg-red-500 text-white font-bold text-sm">거절</button>
              </>}
              {req.status !== 'PENDING' && (
                <div className="flex gap-2">
                  {/* ✅ 승인 대기 이동과 완전 삭제를 별도 버튼으로 분리 */}
                  <button onClick={() => recycleRequestToPending(req)} className="flex-1 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold text-sm">↺ 대기로 이동</button>
                  <button onClick={() => handleDeleteRequest(req)} className="flex-1 px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 font-bold text-sm">🗑 완전 삭제</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[860px]">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-2 md:p-3">구분</th>
              <th className="p-2 md:p-3">반출입일</th>
                            <th className="p-2 md:p-3">저장소/실험실</th>
              <th className="p-2 md:p-3">내선</th>
              <th className="p-2 md:p-3">물질/수량</th>
              <th className="p-2 md:p-3">상태</th>
              <th className="p-2 md:p-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayReqs.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-slate-500">항목이 없습니다.</td></tr>
            ) : (
                displayReqs.map(req => (
                <tr key={req.id} className={req.status === 'PENDING' ? 'bg-blue-50/30' : req.status === 'APPROVED' ? 'bg-green-50/20' : 'bg-red-50/10'}>
                    <td className="p-2 md:p-3"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${req.type === 'IN' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{req.type === 'IN' ? '반입' : '반출'}</span></td>
                    <td className="p-2 md:p-3 text-xs font-bold text-slate-700">{req.actionDate || req.date || '-'}</td>
                                        <td className="p-2 md:p-3"><div className="font-bold text-xs">{req.storage}</div><div className="text-xs text-slate-500">{req.labName}</div></td>
                    <td className="p-2 md:p-3 text-xs text-slate-600 font-medium">{req.ext || '-'}</td>
                    <td className="p-2 md:p-3"><div className="font-bold text-xs">{req.chemicalName}</div><div className="text-xs text-blue-600">{formatBottleDisplay(req.amount, req.unit, req.bottleSize, req.bottleUnit, req.bottleCount, true)}</div><div className="text-xs text-slate-400">{req.manufacturer}</div>{req.inventoryLocked && <div className="mt-1 text-[11px] text-amber-700 font-bold">재고 유지 편집 모드</div>}</td>

                    <td className="p-2 md:p-3">
                      {req.status === 'PENDING' && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">대기중</span>}
                      {req.status === 'APPROVED' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">승인됨</span>}
                      {req.status === 'REJECTED' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">반려됨</span>}
                    </td>
                    <td className="p-2 md:p-3 text-center">
                        <div className="flex justify-center gap-1">
                        {req.status === 'PENDING' && <>
                          <button onClick={() => setEditingRequest(toEditableRequest(req))} className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition" title="내용 수정"><Edit2 size={15}/></button>
                          <button onClick={() => approveRequest(req)} className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition" title={req.inventoryLocked ? '승인(재고 유지)' : '승인'}><CheckCircle size={15}/></button>
                          <button onClick={() => rejectRequest(req.id)} className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition" title="거절"><XCircle size={15}/></button>
                          {/* ✅ 대기 상태도 삭제 가능하도록 추가 */}
                          <button onClick={() => handleDeleteRequest(req)} className="p-1.5 bg-slate-100 text-slate-500 rounded hover:bg-red-100 hover:text-red-600 transition" title="삭제"><Trash2 size={15}/></button>
                        </>}
              {req.status !== 'PENDING' && (
                          <>
                            {/* ✅ "승인 대기로 이동" 과 "완전 삭제"를 분리하여 명확하게 구분 */}
                            <button onClick={() => recycleRequestToPending(req)} className="p-1.5 bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition border border-amber-200" title="승인 대기로 이동(재고 유지)"><RotateCcw size={15}/></button>
                            <button onClick={() => handleDeleteRequest(req)} className="p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-100 transition border border-red-200" title="완전 삭제(재고 롤백)"><Trash2 size={15}/></button>
                          </>
                        )}
                        </div>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* 승인 편집 모달 */}
      {editingRequest && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 pt-5 md:px-6 md:pt-6">
              <h3 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2"><Edit2 size={20} className="text-blue-600"/> 신청 내역 수정</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-5 md:px-6 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">신청 유형</label>
                  <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.type} onChange={e=>setEditingRequest({...editingRequest, type: e.target.value})}>
                    <option value="IN">반입 (입고)</option>
                    <option value="OUT">반출 (출고)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">반출입 예정일</label>
                  <input type="date" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.actionDate || editingRequest.date || getTodayString()} onChange={e=>setEditingRequest({...editingRequest, actionDate: e.target.value})}/>
                </div>
              </div>
              <div className="relative">
                <label className="text-xs font-bold text-slate-600 mb-1 block">물질명</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                      value={editingRequest.chemicalName}
                      onChange={e => { setEditingRequest({...editingRequest, chemicalName: e.target.value}); setIsEditChemDropdownOpen(true); }}
                      onFocus={() => setIsEditChemDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsEditChemDropdownOpen(false), 200)}
                      placeholder="예: a, acetone, 아세톤"
                    />
                    {isEditChemDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto z-20">
                        {editingFilteredChemicals.length > 0 ? editingFilteredChemicals.slice(0, 12).map((chem) => (
                          <button
                            key={chem.id || chem.name}
                            type="button"
                            className="w-full text-left p-3 hover:bg-blue-50 text-sm border-b last:border-b-0 flex justify-between items-center"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEditingRequest({
                                ...editingRequest,
                                chemicalName: getPreferredChemicalLabel(chem.name),
                                chemType: chem.type,
                                cas: chem.cas,
                              });
                              setIsEditChemDropdownOpen(false);
                            }}
                          >
                            <span className="font-bold text-slate-700">{getPreferredChemicalLabel(chem.name)}</span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{chem.type}</span>
                          </button>
                        )) : (
                          <div className="p-3 text-slate-400 text-sm text-center">검색 결과가 없습니다. 직접 입력하세요.</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" className="bg-slate-800 text-white px-3 rounded-lg hover:bg-slate-900 flex items-center gap-1" onClick={() => setIsEditChemDropdownOpen(!isEditChemDropdownOpen)} title="물질 목록 열기"><Search size={16}/></button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">한글/영문 일부만 입력해도 등록된 물질명이 드롭다운으로 추천됩니다.</p>
              </div>
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">수량</label>
                  <input type="number" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.amount} onChange={e=>setEditingRequest({...editingRequest, amount: e.target.value})}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">단위</label>
                  <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.unit} onChange={e=>setEditingRequest({...editingRequest, unit: e.target.value})}>
                    {['L', 'kg', 'mL', 'g', 'Can', 'Bottle'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">성상(물질 유형)</label>
                  <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.chemType || ''} onChange={e=>setEditingRequest({...editingRequest, chemType: e.target.value})}>
                    {['1석유류(비)', '1석유류(수)', '알코올류', '2석유류(비)', '2석유류(수)', '3석유류(비)', '3석유류(수)', '4석유류', '동식물유', '특수인화물', '유독물질', '해당없음'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">제조사</label>
                  <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.manufacturer} onChange={e=>setEditingRequest({...editingRequest, manufacturer: e.target.value})}>
                    <option value="">선택</option>
                    {[...manufacturers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko')).map((m) => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              {(editingRequest.type === 'IN' || editingRequest.type === 'OUT') && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700">선반별 {editingRequest.type === 'IN' ? '보관' : '출고'} 배치</label>
                    <button
                      type="button"
                      onClick={() => setEditingRequest({
                        ...editingRequest,
                        shelfAllocationRows: [...allocationDraftRows, { shelf: '', amount: '' }]
                      })}
                      className="px-2.5 py-1 rounded-lg border border-blue-200 bg-white text-blue-700 text-xs font-bold hover:bg-blue-50"
                    >
                      + 선반 추가
                    </button>
                  </div>

                  <div className="space-y-2">
                    {allocationDraftRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                        <input
                          type="text"
                          className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                          value={row.shelf}
                          onChange={e => setEditingRequest({
                            ...editingRequest,
                            shelfAllocationRows: allocationDraftRows.map((item, rowIndex) => rowIndex === index ? { ...item, shelf: e.target.value } : item)
                          })}
                          placeholder="선반 예: A-1"
                        />
                        <input
                          type="number"
                          className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
                          value={row.amount}
                          onChange={e => setEditingRequest({
                            ...editingRequest,
                            shelfAllocationRows: allocationDraftRows.map((item, rowIndex) => rowIndex === index ? { ...item, amount: e.target.value } : item)
                          })}
                          placeholder="수량"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingRequest({
                            ...editingRequest,
                            shelfAllocationRows: allocationDraftRows.length === 1 ? [{ shelf: '', amount: '' }] : allocationDraftRows.filter((_, rowIndex) => rowIndex !== index)
                          })}
                          className="px-2 py-2 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-bold hover:bg-rose-50"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {shelfSuggestions.length > 0 ? shelfSuggestions.slice(0, 8).map((shelf) => {
                      const selectedSingleShelf = allocationDraftRows.length === 1 ? String(allocationDraftRows[0]?.shelf || '').trim() : '';
                      const isSelected = selectedSingleShelf === shelf;
                      return (
                        <button
                          key={shelf}
                          type="button"
                          onClick={() => setEditingRequest({
                            ...editingRequest,
                            shelfAllocationRows: [{
                              shelf,
                              amount: editingRequest.amount || allocationDraftRows.find(item => Number(item.amount) > 0)?.amount || ''
                            }]
                          })}
                          className={`px-2 py-1 rounded-full border text-xs font-bold transition ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-100'}`}
                        >
                          {shelf}
                        </button>
                      );
                    }) : <span className="text-[11px] text-slate-400">선반 제안이 없으면 직접 입력하거나 + 선반 추가로 행을 더해 주세요.</span>}
                  </div>

                  <div className="flex flex-wrap gap-3 text-[11px] font-medium">
                    <span className="text-slate-600">배치 합계: {allocationDraftTotal}{editingRequest.unit || 'L'}</span>
                    <span className={allocationDraftRemaining === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                      남은 수량: {allocationDraftRemaining}{editingRequest.unit || 'L'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">퀵 버튼은 단일 선반 선택용입니다. 다른 선반을 추가하려면 + 선반 추가를 눌러 직접 입력하세요.</p>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t px-5 py-4 md:px-6 flex gap-3 justify-end pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <button onClick={() => { setIsEditChemDropdownOpen(false); setEditingRequest(null); }} className="px-4 py-2 bg-slate-200 rounded-lg font-medium hover:bg-slate-300">취소</button>
              <button onClick={() => { setIsEditChemDropdownOpen(false); saveEditedRequest(editingRequest); }} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );};

  const renderMyRequestsScreen = () => (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><History className="text-blue-600"/> 신청 현황</h2>
            <p className="text-sm text-slate-500 mt-1">연구실 사용자는 신청 내역을 삭제할 수 없으며, 최근 30일 + 승인 대기 신청만 불러옵니다. 상태가 바뀌지 않았다면 새로고침을 눌러 주세요.</p>
          </div>
          <button onClick={() => loadRequestsOnce({ force: true })} className="self-start px-3 py-2 rounded-lg border bg-white text-slate-700 font-bold text-sm hover:bg-slate-50 flex items-center gap-2">
            <RotateCcw size={14}/> {isRequestsLoading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>

        <div className="md:hidden space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800">{req.chemicalName}</div>
                  <div className="text-xs text-slate-500 mt-1">{req.storage} · {req.labName}</div>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${req.type === 'IN' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{req.type === 'IN' ? '반입' : '반출'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">신청일</div><div className="text-slate-700">{req.actionDate || req.date || '-'}</div></div>
                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">상태</div><div>{req.status === 'PENDING' && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">대기중</span>}{req.status === 'APPROVED' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">승인됨</span>}{req.status === 'REJECTED' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">반려됨</span>}</div></div>
                <div className="rounded-lg bg-slate-50 p-2 col-span-2"><div className="text-[11px] text-slate-400">수량 / 제조사</div><div className="font-medium text-slate-700">{formatBottleDisplay(req.amount, req.unit, req.bottleSize, req.bottleUnit, req.bottleCount)} · {req.manufacturer || '-'}</div></div>
              </div>
            </div>
          ))}
          {requests.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-slate-500">신청 내역이 없습니다.</div>}
        </div>

        <div className="hidden md:block bg-white rounded-xl shadow border overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[520px]">
            <thead className="bg-slate-50 border-b">
              <tr>
                  <th className="p-2 md:p-3">신청일</th>
                  <th className="p-2 md:p-3">구분</th>
                  <th className="p-2 md:p-3">저장소 / 실험실</th>
                  <th className="p-2 md:p-3">물질/수량</th>
                  <th className="p-2 md:p-3 text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map(req => (
                <tr key={req.id} className="hover:bg-slate-50 transition">
                  <td className="p-2 md:p-3 text-xs text-slate-600">{req.actionDate || req.date}</td>
                  <td className="p-2 md:p-3"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${req.type === 'IN' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{req.type === 'IN' ? '반입' : '반출'}</span></td>
                  <td className="p-2 md:p-3">
                      <div className="font-bold text-xs text-slate-700">{req.storage}</div>
                      <div className="text-xs text-slate-500">{req.labName}</div>
                  </td>
                  <td className="p-2 md:p-3">
                      <div className="font-bold text-xs text-slate-800">{req.chemicalName} <span className="text-blue-600 text-xs bg-blue-50 px-1 py-0.5 rounded border border-blue-100">{formatBottleDisplay(req.amount, req.unit, req.bottleSize, req.bottleUnit, req.bottleCount)}</span></div>
                      <div className="text-xs text-slate-500">{req.manufacturer}</div>
                  </td>
                  <td className="p-2 md:p-3 text-center">
                      {req.status === 'PENDING' && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">대기중</span>}
                      {req.status === 'APPROVED' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">승인됨</span>}
                      {req.status === 'REJECTED' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">반려됨</span>}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500">신청 내역이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderHistoryScreen = () => {
    const filteredHistory = expandedHistoryEntries.filter(h => {
        if (historyFilter.type !== 'All' && h.type !== historyFilter.type) return false;
        if (historyFilter.storage !== 'All' && h.storage !== historyFilter.storage) return false;
        if (historyFilter.startDate && h.actionDate < historyFilter.startDate) return false;
        if (historyFilter.endDate && h.actionDate > historyFilter.endDate) return false;
        return true;
    });

    const totalInAmount = filteredHistory
        .filter(h => h.type === 'IN')
        .reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
    const totalOutAmount = filteredHistory
        .filter(h => h.type === 'OUT')
        .reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
    const splitRowCount = filteredHistory.filter(h => (h.splitHistoryCount || 1) > 1).length;
    const groupedSplitCount = new Set(filteredHistory.filter(h => (h.splitHistoryCount || 1) > 1).map(h => h.historyGroupId || h.originalReqId || h.id)).size;

    return (
        <>
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft className="text-blue-600"/> 반출입 기록 조회</h2>
                <button onClick={() => loadHistoryOnce({ force: true })} className="self-start px-3 py-2 rounded-lg border bg-white text-slate-700 font-bold text-sm hover:bg-slate-50 flex items-center gap-2">
                    <RotateCcw size={14}/> {isHistoryLoading ? '불러오는 중...' : '새로고침'}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">조회 건수</div>
                    <div className="mt-1 text-2xl font-bold text-slate-800">{filteredHistory.length}</div>
                    <div className="mt-1 text-xs text-slate-400">현재 필터 기준 표시 행 수</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-xs font-bold text-emerald-700">반입 합계</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-700">{totalInAmount.toFixed(2)}</div>
                    <div className="mt-1 text-xs text-emerald-600">숫자 형식으로 CSV 내보내기 지원</div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <div className="text-xs font-bold text-rose-700">반출 합계</div>
                    <div className="mt-1 text-2xl font-bold text-rose-700">{totalOutAmount.toFixed(2)}</div>
                    <div className="mt-1 text-xs text-rose-600">엑셀 계산용 드래그/합산에 맞춘 수량 열</div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-xs font-bold text-blue-700">분할 선반 행</div>
                    <div className="mt-1 text-2xl font-bold text-blue-700">{splitRowCount}</div>
                    <div className="mt-1 text-xs text-blue-600">분할 승인 묶음 {groupedSplitCount}건</div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 border p-2 rounded bg-slate-50">
                    <span className="text-sm font-bold text-slate-600 hidden sm:inline">기간:</span>
                    <input 
                        type="date" 
                        className="bg-transparent focus:outline-none text-slate-600 text-sm w-28"
                        value={historyFilter.startDate} 
                        onChange={e => setHistoryFilter({...historyFilter, startDate: e.target.value})}
                        title="시작일"
                    />
                    <span className="text-slate-400">~</span>
                    <input 
                        type="date" 
                        className="bg-transparent focus:outline-none text-slate-600 text-sm w-28"
                        value={historyFilter.endDate} 
                        onChange={e => setHistoryFilter({...historyFilter, endDate: e.target.value})}
                        title="종료일"
                    />
                    {(historyFilter.startDate || historyFilter.endDate) && (
                        <button 
                            onClick={() => setHistoryFilter({...historyFilter, startDate: getDateDaysAgoString(HISTORY_DEFAULT_LOOKBACK_DAYS), endDate: ''})} 
                            className="ml-1 text-slate-400 hover:text-red-500 transition"
                            title="최근 90일 기본값으로 복원"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                <select className="border p-2 rounded focus:ring-2 focus:ring-blue-500" value={historyFilter.type} onChange={e => setHistoryFilter({...historyFilter, type: e.target.value})}>
                    <option value="All">전체 구분</option><option value="IN">반입</option><option value="OUT">반출</option>
                </select>
                <select className="border p-2 rounded focus:ring-2 focus:ring-blue-500" value={historyFilter.storage} onChange={e => setHistoryFilter({...historyFilter, storage: e.target.value})}>
                    <option value="All">전체 저장소</option>
                    {historyStorageOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="ml-auto w-full md:w-auto">
                    <div className="flex gap-2 flex-wrap w-full md:w-auto">
                    <button onClick={() => {
                        const csvHeader = "일자,구분,저장소,선반,실험실,물질명,CAS No.,성상,수량,제조사\n";
                        const csvData = filteredHistory.map(h => {
                            const chemInfo = chemicalInfoMap.get(String(h.chemicalName || '')) || {};
                            const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                            const chemType = normalizeChemicalType(h.chemType || chemInfo.type || '-') || '-';
                            const shelfInfo = h.shelf || '미지정';
                            return [
                                csvEscapeText(h.actionDate),
                                csvEscapeText(h.type==='IN'?'반입':'반출'),
                                csvEscapeText(h.storage),
                                csvEscapeText(shelfInfo),
                                csvEscapeText(h.labName),
                                csvEscapeText(h.chemicalName),
                                csvEscapeExcelText(casNo),
                                csvEscapeText(chemType),
                                csvEscapeNumber(h.amount),
                                csvEscapeText(h.manufacturer)
                            ].join(',');
                        }).join("\n");
                        downloadCSV(csvHeader + csvData, `history_${historyFilter.startDate || 'all'}_${historyFilter.endDate || 'all'}.csv`);
                    }} className="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded font-bold flex items-center justify-center gap-2 hover:bg-green-700">
                        <Download size={16}/> CSV 다운로드
                    </button>
                    <button onClick={() => {
                        const rows = filteredHistory.map(h => {
                            const chemInfo = chemicalInfoMap.get(String(h.chemicalName || '')) || {};
                            const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                            const chemType = normalizeChemicalType(h.chemType || chemInfo.type || '-') || '-';
                            const shelfInfo = h.shelf || '미지정';
                            const esc = v => String(v||'-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                            return `<tr>
                                <td>${esc(h.actionDate)}</td>
                                <td>${esc(h.type==='IN'?'반입':'반출')}</td>
                                <td>${esc(h.storage)}</td>
                                <td>${esc(shelfInfo)}</td>
                                <td>${esc(h.labName)}</td>
                                <td>${esc(h.chemicalName)}</td>
                                <td>${esc(casNo)}</td>
                                <td>${esc(chemType)}</td>
                                <td>${esc(h.amount)}</td>
                                <td>${esc(h.unit)}</td>
                                <td>${esc(h.manufacturer||'-')}</td>
                            </tr>`;
                        }).join('');
                        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>table{border-collapse:collapse;font-family:sans-serif;font-size:12px;}
th,td{border:1px solid #ccc;padding:6px 10px;white-space:nowrap;}
th{background:#f1f5f9;font-weight:bold;}</style></head><body>
<h2 style="font-family:sans-serif">반출입 기록 조회</h2>
<table><thead><tr>
<th>처리일자</th><th>구분</th><th>저장소</th><th>선반</th>
<th>실험실</th><th>물질명</th><th>CAS No.</th><th>성상</th>
<th>수량</th><th>단위</th><th>제조사</th>
</tr></thead><tbody>${rows}</tbody></table></body></html>`;
                        const blob = new Blob([html], {type:'text/html;charset=utf-8'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `history_${historyFilter.startDate || 'all'}_${historyFilter.endDate || 'all'}_상세내역.html`;
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a); URL.revokeObjectURL(url);
                    }} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded font-bold flex items-center justify-center gap-2 hover:bg-blue-700">
                        <Download size={16}/> 상세 HTML 다운로드
                    </button>
                    </div>
                </div>
            </div>

            <div className="md:hidden space-y-3">
                {filteredHistory.map(h => {
                    const chemInfo = chemicals.find(c => c.name === h.chemicalName) || {};
                    const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                    const chemType = normalizeChemicalType(h.chemType || chemInfo.type || '-') || '-';
                    const shelfInfo = h.shelf || '미지정';
                    return (
                        <div key={h.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                        <span>{h.chemicalName}</span>
                                        {(h.splitHistoryCount || 1) > 1 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">분할 {h.splitHistoryIndex}/{h.splitHistoryCount}</span>}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{h.storage} · {h.labName}</div>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-bold ${h.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{h.type === 'IN' ? '반입' : '반출'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">처리일자</div><div className="text-slate-700">{h.actionDate}</div></div>
                                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">선반</div><div className="font-bold text-blue-700">{shelfInfo}</div></div>
                                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">CAS / 성상</div><div className="text-xs text-slate-600">{casNo}<br />{chemType}</div></div>
                                <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-400">수량</div><div className="font-bold text-blue-700">{h.amount}{h.unit}</div></div>
                                <div className="rounded-lg bg-slate-50 p-2 col-span-2"><div className="text-[11px] text-slate-400">제조사</div><div className="text-slate-600">{h.manufacturer || '-'}</div></div>
                            </div>
                        </div>
                    );
                })}
                {filteredHistory.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-slate-500">기록이 없습니다.</div>}
            </div>

            <div className="hidden md:block bg-white rounded-xl shadow border overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[1100px]">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="p-3">처리일자</th>
                            <th className="p-3">구분</th>
                            <th className="p-3">저장소</th>
                            <th className="p-3">실험실</th>
                            <th className="p-3">선반</th>
                            <th className="p-3">물질명 / 세부정보</th>
                            <th className="p-3 text-right">수량</th>
                            <th className="p-3">제조사</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredHistory.map(h => {
                            const chemInfo = chemicals.find(c => c.name === h.chemicalName) || {};
                            const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                            const chemType = normalizeChemicalType(h.chemType || chemInfo.type || '-') || '-';
                            const shelfInfo = h.shelf || '미지정';

                            return (
                                <tr key={h.id} className="hover:bg-slate-50">
                                    <td className="p-3 text-slate-600">{h.actionDate}</td>
                                    <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${h.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{h.type === 'IN' ? '반입' : '반출'}</span></td>
                                    <td className="p-3 font-medium text-slate-800">{h.storage}</td>
                                    <td className="p-3 text-slate-600">{h.labName}</td>
                                    <td className="p-3">
                                        <div className="font-bold text-blue-700">{shelfInfo}</div>
                                        {(h.splitHistoryCount || 1) > 1 && <div className="mt-1 text-[11px] text-blue-600">분할 {h.splitHistoryIndex}/{h.splitHistoryCount}</div>}
                                    </td>
                                    <td className="p-3">
                                        <div className="font-medium text-slate-800">{h.chemicalName}</div>
                                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">CAS: {casNo}</span>
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{chemType}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right font-bold text-blue-600">{h.amount}{h.unit}</td>
                                    <td className="p-3 text-slate-500">{h.manufacturer}</td>
                                </tr>
                            );
                        })}
                        {filteredHistory.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-slate-500">기록이 없습니다.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>

        </>
    );
  };

  const renderMasterDataScreen = () => (
      <div className="space-y-4">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><Database className="text-blue-600"/> 기초 데이터 관리</h2>
          
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button onClick={() => setMasterSubTab('labs')} className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition ${masterSubTab === 'labs' ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>실험실 목록</button>
              <button onClick={() => setMasterSubTab('chemicals')} className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition ${masterSubTab === 'chemicals' ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>위험물 사전</button>
              <button onClick={() => setMasterSubTab('manufacturers')} className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition ${masterSubTab === 'manufacturers' ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>제조사 관리</button>
          </div>

          <div className="bg-white rounded-xl shadow border overflow-x-auto">
              {masterSubTab === 'labs' && (
                  <div className="p-4">
                      <div className="flex justify-end gap-2 mb-3">
                    <label className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-green-700 transition cursor-pointer flex items-center gap-1.5">
                      <Upload size={14}/> CSV 일괄 업로드
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                        const file = e.target.files[0]; if (!file) return;
                        try {
                          const rows = await parseFileToRows(file);
                          let count = 0;
                          const validStorages = ['제1공학관', '제1과학기술관', '동물실험동'];
                          for (const parts of rows) {
                            const labData = { 
                              name: String(parts[0] || '').trim(), 
                              loc: String(parts[1] || '').trim(), 
                              ext: String(parts[2] || '').trim(), 
                              storage: validStorages.includes(String(parts[3] || '').trim()) ? String(parts[3]).trim() : '제1공학관'
                            };
                            if (!labData.name) continue;
                            if (isDemoMode) { setLabs(prev => [...prev, { id: String(Date.now() + count), ...labData }]); }
                            else { try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'labs'), labData); } catch(err) { console.error(err); } }
                            count++;
                          }
                          if (!isDemoMode) await loadStaticReferenceData({ force: true });
                          showAlert("완료", `실험실 ${count}건이 업로드되었습니다.`);
                        } catch(err) { showAlert("오류", "파일 읽기 실패: " + err.message); }
                        e.target.value = '';
                      }}/>
                    </label>
                    <a href="data:text/csv;charset=utf-8,%EF%BB%BF%EC%8B%A4%ED%97%98%EC%8B%A4%EB%AA%85%2C%EC%9C%84%EC%B9%98%2C%EB%82%B4%EC%84%A0%EB%B2%88%ED%98%B8%2C%EA%B8%B0%EB%B3%B8%EC%A0%80%EC%9E%A5%EC%86%8C%0A%EC%97%B0%EA%B5%AC%EC%8B%A4A%2C101%ED%98%B8%2C1234%2C%EC%A0%9C1%EA%B3%B5%ED%95%99%EA%B4%80" download="실험실_업로드양식.csv" className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-300 transition flex items-center gap-1.5">
                      <FileSpreadsheet size={14}/> 양식 다운로드
                    </a>
                    <button onClick={() => setMasterAddModal({isOpen: true, type: 'lab'})} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition">+ 직접 추가</button>
                  </div>
                      <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
                          <thead className="bg-slate-50 border-b"><tr><th className="p-3">ID</th><th className="p-3">실험실명</th><th className="p-3">위치</th><th className="p-3">내선번호</th><th className="p-3">기본 저장소</th><th className="p-3 text-center">삭제</th></tr></thead>
                          <tbody className="divide-y">{[...labs].sort((a,b) => (a.name||"").localeCompare(b.name||"","ko")).map(l => (
                              <tr key={l.id} className="hover:bg-slate-50">
                                  <td className="p-3 text-xs text-slate-400">{String(l.id).substring(0,6)}...</td>
                                  <td className="p-3 font-bold">{l.name}</td>
                                  <td className="p-3">{l.loc}</td>
                                  <td className="p-3">{l.ext}</td>
                                  <td className="p-3 text-blue-600 font-medium">{l.storage}</td>
                                  <td className="p-3 text-center">
                                      <button onClick={() => handleDeleteMasterData('lab', l.id)} className="text-slate-400 hover:text-red-500 transition p-1 rounded hover:bg-red-50"><Trash2 size={16}/></button>
                                  </td>
                              </tr>
                          ))}</tbody>
                      </table>
                  </div>
              )}
              {masterSubTab === 'chemicals' && (
                  <div className="p-4">
                      <div className="flex justify-end gap-2 mb-3">
                    <label className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-green-700 transition cursor-pointer flex items-center gap-1.5">
                      <Upload size={14}/> CSV 일괄 업로드
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                        const file = e.target.files[0]; if (!file) return;
                        try {
                          const rows = await parseFileToRows(file);
                          let count = 0;
                          const validTypes = Object.keys(DESIGNATED_QTY);
                          for (const parts of rows) {
                            const chemData = { 
                              cas: String(parts[0] || '-').trim() || '-', 
                              name: String(parts[1] || '').trim(), 
                              type: validTypes.includes(String(parts[2] || '').trim()) ? String(parts[2]).trim() : '1석유류(비)'
                            };
                            if (!chemData.name) continue;
                            const duplicate = chemicals.find(c => c.name === chemData.name);
                            if (duplicate) continue;
                            if (isDemoMode) { setChemicals(prev => [...prev, { id: String(Date.now() + count), ...chemData }]); }
                            else { try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chemicals'), chemData); } catch(err) { console.error(err); } }
                            count++;
                          }
                          if (!isDemoMode) await loadStaticReferenceData({ force: true });
                          showAlert("완료", `위험물 ${count}건이 업로드되었습니다.`);
                        } catch(err) { showAlert("오류", "파일 읽기 실패: " + err.message); }
                        e.target.value = '';
                      }}/>
                    </label>
                    <a href="data:text/csv;charset=utf-8,%EF%BB%BF CAS No.%2C%EB%AC%BC%EC%A7%88%EB%AA%85%2C%EC%84%B1%EC%83%81%0A67-64-1%2CAcetone%2C1%EC%84%9D%EC%9C%A0%EB%A5%98(%EC%88%98)" download="위험물_업로드양식.csv" className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-300 transition flex items-center gap-1.5">
                      <FileSpreadsheet size={14}/> 양식 다운로드
                    </a>
                    <button onClick={() => setMasterAddModal({isOpen: true, type: 'chemical'})} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition">+ 직접 추가</button>
                  </div>
                      <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
                          <thead className="bg-slate-50 border-b"><tr><th className="p-3">CAS No.</th><th className="p-3">물질명</th><th className="p-3">성상(분류)</th><th className="p-3 text-center">삭제</th></tr></thead>
                          <tbody className="divide-y">{[...chemicals].sort((a,b) => (a.name||"").localeCompare(b.name||"")).map((c, i) => (
                              <tr key={c.id || i} className="hover:bg-slate-50">
                                  <td className="p-3 text-slate-500">{c.cas}</td>
                                  <td className="p-3 font-bold">{c.name}</td>
                                  <td className="p-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs">{c.type}</span></td>
                                  <td className="p-3 text-center">
                                      <button onClick={() => handleDeleteMasterData('chemical', c.id || c.name)} className="text-slate-400 hover:text-red-500 transition p-1 rounded hover:bg-red-50"><Trash2 size={16}/></button>
                                  </td>
                              </tr>
                          ))}</tbody>
                      </table>
                  </div>
              )}
              {masterSubTab === 'manufacturers' && (
                  <div className="p-4">
                      <div className="flex flex-wrap gap-2 mb-4">
                          {[...manufacturers].sort((a,b) => { const na = typeof a === "object" ? a.name : a; const nb = typeof b === "object" ? b.name : b; return na.localeCompare(nb,"ko"); }).map((m) => {
                              const name = typeof m === 'object' ? m.name : m;
                              const id = typeof m === 'object' ? m.id : name; 
                              return (
                                <span key={id} className="group relative bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 hover:bg-blue-100 pr-8 transition">
                                    {name}
                                    <button onClick={() => handleDeleteMasterData('manufacturer', id)} className="absolute right-1 p-1 text-blue-400 hover:text-red-500 rounded-full hover:bg-white"><X size={14}/></button>
                                </span>
                              );
                          })}
                          <label className="bg-green-600 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-sm hover:bg-green-700 transition cursor-pointer flex items-center gap-1">
                            <Upload size={12}/> CSV 업로드
                            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0]; if (!file) return;
                              try {
                                const rows = await parseFileToRows(file);
                                let count = 0;
                                // ✅ 실패 건수 추적
                                let failCount = 0;
                                for (const parts of rows) {
                                  const name = String(parts[0] || '').trim();
                                  if (!name || manufacturers.some(m => normalizeChemicalKey(getManufacturerName(m)) === normalizeChemicalKey(name))) continue;
                                  if (isDemoMode) {
                                    setManufacturers(prev => [...prev, { id: String(Date.now() + count), name }]);
                                    count++;
                                  } else {
                                    try {
                                      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'manufacturers'), { name });
                                      count++;
                                    } catch(err) {
                                      // ✅ 오류 무시 대신 실패 카운트
                                      console.error('제조사 저장 실패:', name, err);
                                      failCount++;
                                    }
                                  }
                                }
                                if (!isDemoMode) await loadStaticReferenceData({ force: true });
                                if (failCount > 0) {
                                  showAlert("완료 (일부 실패)", `제조사 ${count}건 업로드 완료, ${failCount}건 실패`);
                                } else {
                                  showAlert("완료", `제조사 ${count}건 업로드 완료`);
                                }
                              } catch(err) { showAlert("오류", "파일 읽기 실패: " + err.message); }
                              e.target.value = '';
                            }}/>
                          </label>
                          <button onClick={() => setMasterAddModal({isOpen: true, type: 'manufacturer'})} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-sm hover:bg-blue-700 transition">+ 직접 추가</button>
                      </div>
                  </div>
              )}
          </div>

          {/* 추가 모달창 */}
          {masterAddModal.isOpen && (
              <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
                      <h3 className="text-xl font-bold mb-4 text-slate-800">
                          {masterAddModal.type === 'lab' ? '새 실험실 추가' : masterAddModal.type === 'chemical' ? '새 위험물 추가' : '새 제조사 추가'}
                      </h3>
                      
                      <div className="space-y-4 mb-6">
                          {masterAddModal.type === 'lab' && (
                              <>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">실험실명</label><input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newLabData.name} onChange={e=>setNewLabData({...newLabData, name:e.target.value})} /></div>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">위치 (호수)</label><input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newLabData.loc} onChange={e=>setNewLabData({...newLabData, loc:e.target.value})} /></div>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">내선번호</label><input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newLabData.ext} onChange={e=>setNewLabData({...newLabData, ext:e.target.value})} /></div>
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">기본 저장소</label>
                                      <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newLabData.storage} onChange={e=>setNewLabData({...newLabData, storage:e.target.value})}>
                                          {['제1공학관', '제1과학기술관', '동물실험동', '기타'].map(s=><option key={s} value={s}>{s}</option>)}
                                      </select>
                                  </div>
                              </>
                          )}
                          {masterAddModal.type === 'chemical' && (
                              <>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">CAS No.</label><input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newChemData.cas} onChange={e=>setNewChemData({...newChemData, cas:e.target.value})} placeholder="예: 67-64-1"/></div>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">물질명</label><input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newChemData.name} onChange={e=>setNewChemData({...newChemData, name:e.target.value})} /></div>
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">성상 (분류)</label>
                                      <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newChemData.type} onChange={e=>setNewChemData({...newChemData, type:e.target.value})}>
                                          {['1석유류(비)', '1석유류(수)', '알코올류', '2석유류(비)', '2석유류(수)', '3석유류(비)', '3석유류(수)', '4석유류', '동식물유', '특수인화물', '산화성액체', '유독물질', '해당없음'].map(s=><option key={s} value={s}>{s}</option>)}
                                      </select>
                                  </div>
                              </>
                          )}
                          {masterAddModal.type === 'manufacturer' && (
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">제조사명</label><input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newManufacturer} onChange={e=>setNewManufacturer(e.target.value)} placeholder="예: 덕산약품공업"/></div>
                          )}
                      </div>

                      <div className="flex gap-3 justify-end">
                          <button onClick={() => setMasterAddModal({isOpen: false, type: ''})} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium">취소</button>
                          <button onClick={handleSaveMasterData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">저장</button>
                      </div>
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      {renderModal()}
      {renderInvEditModal()}
      {renderInventoryRecordEditModal()}
      {renderInventoryAdjustModal()}
      {renderSubmittingOverlay()}
      {!currentUser ? renderLoginScreen() : (
          <>
             {renderSidebar()}
             <div className="flex-1 flex flex-col overflow-hidden h-screen w-full">
                 <header className="md:hidden bg-white border-b p-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
                     <h1 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        {currentUser === 'admin' ? <Settings size={20} className="text-blue-600"/> : <ShieldAlert size={20} className="text-orange-600"/>} 
                        위험물 관리
                     </h1>
                     <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition">
                         <Menu size={24} />
                     </button>
                 </header>
                 
                 <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
                    {activeTab === 'dashboard' && renderDashboardScreen()}
                    {activeTab === 'notices' && renderNoticesScreen()}
                    {activeTab === 'approvals' && renderApprovalScreen()}
                    {activeTab === 'request' && renderRequestFormScreen()}
                    {activeTab === 'admin_inventory' && renderAdminInventoryScreen()}
                    {activeTab === 'public_status' && renderStorageStatusScreen()}
                    {currentUser !== 'admin' && activeTab === 'safety_status' && renderSafetyStatusScreen()}
                    {activeTab === 'my_requests' && renderMyRequestsScreen()}
                    {activeTab === 'history' && renderHistoryScreen()}
                    {activeTab === 'masterData' && renderMasterDataScreen()}
                 </main>
             </div>
          </>
      )}
    </div>
  );
}
