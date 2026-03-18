import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  PackagePlus, PackageMinus, Settings, Download, Users, ShieldAlert, 
  CheckCircle, XCircle, Trash2, Database, ArrowRightLeft, LayoutDashboard, 
  LogOut, FlaskConical, ClipboardList, BarChart3, Lock, Filter, Info, History, AlertTriangle,
  Menu, X, ChevronDown, ChevronRight, Trophy, Cloud, WifiOff,
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
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, writeBatch } from "firebase/firestore";

// 🔴 [수정 필요] 아래 값들을 Firebase 콘솔에서 복사한 값으로 바꿔주세요.
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
const getTodayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${("0" + (date.getMonth() + 1)).slice(-2)}-${("0" + date.getDate()).slice(-2)}`;
};

const downloadCSV = (content, filename) => {
    const encodedUri = encodeURI("data:text/csv;charset=utf-8,\uFEFF" + content);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                           (flat.length > 0 && /[\x80-\xff]/.test(flat) && !/[가-힣]/.test(flat) && /[가-힣]/.test(flat) === false);
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
  }, [resetKey]); // eslint-disable-line

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
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
      <div className="relative border-2 border-dashed border-blue-300 rounded-xl bg-slate-50 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={140}
          className="w-full touch-none block"
          style={{ cursor: 'crosshair', display: 'block' }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-slate-300 text-sm font-medium">이 곳에 서명하세요 ✍️</span>
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

  const [labs, setLabs] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);

  const [historyFilter, setHistoryFilter] = useState({ startDate: '', endDate: '', storage: 'All', type: 'All' });
  const [selectedChemDetail, setSelectedChemDetail] = useState(null); 
  const [selectedLabDetail, setSelectedLabDetail] = useState(null); 
  const [masterSubTab, setMasterSubTab] = useState('labs'); 
  const [dashboardTab, setDashboardTab] = useState('제1과학기술관');

  const [masterAddModal, setMasterAddModal] = useState({ isOpen: false, type: '' });
  const [newLabData, setNewLabData] = useState({ name: '', loc: '', ext: '', storage: '제1공학관' });
  const [newChemData, setNewChemData] = useState({ cas: '', name: '', type: '1석유류(비)' });
  const [newManufacturer, setNewManufacturer] = useState('');

  const [requestForm, setRequestForm] = useState({ type: 'IN', labName: '', storage: '', ext: '', chemicalName: '', amount: '', unit: 'L', manufacturer: '', requestorName: '' });
  const [expandedStats, setExpandedStats] = useState({});
  const [isChemDropdownOpen, setIsChemDropdownOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null); // 승인화면 편집 모달용
  const [bulkImportModal, setBulkImportModal] = useState(false); // 반출입 일괄 등록 모달
  const [bulkImportRows, setBulkImportRows] = useState([]); // 파싱된 일괄 등록 행
  const [bulkImportErrors, setBulkImportErrors] = useState([]); // 유효성 검사 오류

  // ── 공지사항 상태 ──
  const [notices, setNotices] = useState([]);
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', important: false });

  // ── 승인 탭 상태 (훅 위반 수정: renderApprovalScreen 내부에서 이동) ──
  const [approvalViewTab, setApprovalViewTab] = useState('pending');

  // ── 서명 관련 상태 ──
  const [signatureData, setSignatureData] = useState('');      // 신청 폼 현재 서명 (base64)
  const [signaturePadKey, setSignaturePadKey] = useState(0);   // 서명 패드 강제 초기화용 key
  const [signatureViewModal, setSignatureViewModal] = useState(null); // 서명 확인 모달 (이미지 URL)
  const [invFilter, setInvFilter] = useState({ storage: 'All', labName: 'All', chemType: 'All' }); // 재고 현황 조회 필터
  const [invSort, setInvSort] = useState({ key: 'storage', dir: 'asc' }); // 재고 현황 정렬
  const [editHistoryItem, setEditHistoryItem] = useState(null); // 반출입 기록 수정 모달

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

  // --- 2. Data Sync Effects ---
  useEffect(() => {
    if (isDemoMode || !user || !db) return;

    const labsRef = collection(db, 'artifacts', appId, 'public', 'data', 'labs');
    const chemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'chemicals');
    const manufRef = collection(db, 'artifacts', appId, 'public', 'data', 'manufacturers');
    const invRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const reqRef = collection(db, 'artifacts', appId, 'public', 'data', 'requests');
    const histRef = collection(db, 'artifacts', appId, 'public', 'data', 'history');

    const unsubLabs = onSnapshot(labsRef, async (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id })); 
        if (data.length === 0 && !snapshot.metadata.fromCache) {
            const batch = writeBatch(db);
            SEED_LABS.forEach(item => batch.set(doc(labsRef), item));
            await batch.commit();
        } else {
            setLabs(data);
        }
    });

    const unsubChems = onSnapshot(chemsRef, async (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        if (data.length === 0 && !snapshot.metadata.fromCache) {
            const batch = writeBatch(db);
            SEED_CHEMICALS.forEach(item => batch.set(doc(chemsRef), item));
            await batch.commit();
        } else {
            setChemicals(data);
        }
    });

    const unsubManuf = onSnapshot(manufRef, async (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        if (data.length === 0 && !snapshot.metadata.fromCache) {
            const batch = writeBatch(db);
            SEED_MANUFACTURERS.forEach(item => batch.set(doc(manufRef), item));
            await batch.commit();
        } else {
            setManufacturers(data.map(d => ({ id: d.id, name: d.name })));
        }
    });

    const unsubInv = onSnapshot(invRef, (snapshot) => {
        setInventory(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    const unsubReq = onSnapshot(reqRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        setRequests(data.sort((a,b) => b.createdAt - a.createdAt));
    });
    const unsubHist = onSnapshot(histRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        setHistory(data.sort((a,b) => b.processedAt - a.processedAt));
    });

    const noticesRef = collection(db, 'artifacts', appId, 'public', 'data', 'notices');
    const unsubNotices = onSnapshot(noticesRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        setNotices(data.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });

    return () => {
        unsubLabs(); unsubChems(); unsubManuf(); unsubInv(); unsubReq(); unsubHist(); unsubNotices();
    };
  }, [user, db, appId, isDemoMode]);


  // --- Logic Helpers ---
  const showAlert = (title, message) => setModal({ isOpen: true, type: 'info', title, message, onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });

  const navigateTo = (tab) => {
      setActiveTab(tab);
      setIsMobileMenuOpen(false);
  };

  // ── 로그아웃: 모든 UI 상태 초기화 ──
  const handleLogout = () => {
      setCurrentUser(null);
      setBulkImportModal(false);
      setBulkImportRows([]);
      setBulkImportErrors([]);
      setEditingRequest(null);
      setShowPasswordModal(false);
      setPasswordInput('');
      setActiveTab('dashboard');
      setIsMobileMenuOpen(false);
      setApprovalViewTab('pending');
      setSignatureData('');
      setSignaturePadKey(k => k + 1);
      setSignatureViewModal(null);
      setInvFilter({ storage: 'All', labName: 'All', chemType: 'All' });
      setInvSort({ key: 'storage', dir: 'asc' });
      setEditHistoryItem(null);
  };

  const handleAdminLogin = () => {
      if (passwordInput === '4571') {
          setCurrentUser('admin');
          navigateTo('dashboard');
          setShowPasswordModal(false);
          setPasswordInput('');
      } else {
          showAlert("경고", "비밀번호가 올바르지 않습니다.");
      }
  };

  // --- CRUD Operations ---
  const submitRequest = async (keepForm = false) => {
    if (!requestForm.labName || !requestForm.chemicalName || !requestForm.amount) {
      showAlert("안내", "필수 정보(저장소·실험실·물질명·수량)를 모두 입력해주세요."); return;
    }
    if (!requestForm.requestorName || !requestForm.requestorName.trim()) {
      showAlert("안내", "신청자 성명을 입력해주세요."); return;
    }
    if (!signatureData) {
      showAlert("안내", "서명란에 서명을 해주세요."); return;
    }
    const chem = chemicals.find(c => c.name === requestForm.chemicalName);
    const newRequest = { 
        createdAt: Date.now(), 
        status: 'PENDING', 
        date: getTodayString(), 
        shelf: '미지정', 
        chemType: chem ? chem.type : '미지정', 
        cas: chem ? chem.cas : '-',
        signature: signatureData,
        requestorName: requestForm.requestorName || '서명자',
        ...requestForm 
    };
    
    try {
        if (isDemoMode) {
            setRequests([{...newRequest, id: Date.now()}, ...requests]);
        } else {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), newRequest);
        }
        if (keepForm) {
            // 이어서 신청: 저장소·실험실·유형·이름·서명 유지, 물질/수량/제조사만 초기화
            setRequestForm(prev => ({ ...prev, chemicalName: '', amount: '', manufacturer: '', chemType: '', cas: '' }));
            // signatureData, requestorName은 유지 (초기화하지 않음)
            showAlert("성공", "신청이 완료되었습니다. 다음 물질을 신청해주세요.");
        } else {
            setRequestForm({ type: 'IN', labName: '', storage: '', ext: '', chemicalName: '', amount: '', unit: 'L', manufacturer: '', chemType: '', requestorName: '' });
            setSignatureData('');
            setSignaturePadKey(k => k + 1);
            navigateTo('my_requests');
        }
    } catch (e) {
        showAlert("오류", "신청 중 오류가 발생했습니다.");
    }
  };

  const approveRequest = async (req) => {
    const isCheckIn = req.type === 'IN';
    const targetAmount = Number(req.amount);
    
    if (isDemoMode) {
        let newInventory = [...inventory];
        let targetItem = newInventory.find(item => 
            item.storage === req.storage && 
            (isCheckIn ? item.shelf === req.shelf : true) &&
            item.chemicalName === req.chemicalName && 
            item.labName === req.labName &&
            (isCheckIn ? item.manufacturer === req.manufacturer : true)
        );

        if (isCheckIn) {
            if (targetItem) {
                targetItem.amount = Number(targetItem.amount) + targetAmount;
            } else {
                newInventory.push({
                    id: Date.now(),
                    storage: req.storage, shelf: req.shelf, chemicalName: req.chemicalName, 
                    type: req.chemType, amount: targetAmount, unit: req.unit, 
                    manufacturer: req.manufacturer, labName: req.labName, cas: req.cas || '-'
                });
            }
        } else {
            let remaining = targetAmount;
            const candidates = newInventory.filter(item => 
                item.storage === req.storage && item.chemicalName === req.chemicalName && item.labName === req.labName
            );
            if (candidates.length === 0) { showAlert("실패", "재고 부족"); return; }
            
            for (let item of candidates) {
                if (remaining <= 0) break;
                if (item.amount >= remaining) {
                    item.amount -= remaining; remaining = 0;
                } else {
                    remaining -= item.amount; item.amount = 0;
                }
            }
            if (remaining > 0) { showAlert("실패", "재고 부족"); return; }
            newInventory = newInventory.filter(i => i.amount > 0);
        }
        
        setInventory(newInventory);
        setRequests(requests.map(r => r.id === req.id ? { ...r, status: 'APPROVED' } : r));
        setHistory([{ ...req, actionDate: getTodayString(), status: 'APPROVED', processedAt: Date.now() }, ...history]);
        return;
    }

    try {
        const batch = writeBatch(db);
        let targetItem = inventory.find(item => 
            item.storage === req.storage && 
            (isCheckIn ? item.shelf === req.shelf : true) &&
            item.chemicalName === req.chemicalName && 
            item.labName === req.labName &&
            (isCheckIn ? item.manufacturer === req.manufacturer : true)
        );

        if (isCheckIn) {
            if (targetItem) {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', targetItem.id);
                batch.update(docRef, { amount: Number(targetItem.amount) + targetAmount });
            } else {
                const docRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
                batch.set(docRef, {
                    storage: req.storage, shelf: req.shelf, chemicalName: req.chemicalName, 
                    type: req.chemType, amount: targetAmount, unit: req.unit, 
                    manufacturer: req.manufacturer, labName: req.labName, cas: req.cas || '-'
                });
            }
        } else {
            let remaining = targetAmount;
            const candidates = inventory.filter(item => 
                item.storage === req.storage && item.chemicalName === req.chemicalName && item.labName === req.labName
            );
            if (candidates.length === 0) { showAlert("실패", "해당 조건의 재고가 없습니다."); return; }

            for (let item of candidates) {
                if (remaining <= 0) break;
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', item.id);
                if (item.amount >= remaining) {
                    const newAmt = Number(item.amount) - remaining;
                    if (newAmt === 0) {
                        batch.delete(docRef); // ✅ amount=0이면 문서 삭제
                    } else {
                        batch.update(docRef, { amount: newAmt });
                    }
                    remaining = 0;
                } else {
                    remaining -= item.amount;
                    batch.delete(docRef); // ✅ 완전 소진 시 문서 삭제
                }
            }
            if (remaining > 0) { showAlert("실패", "재고가 부족하여 출고할 수 없습니다."); return; }
        }

        const reqRef = doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id);
        // ✅ shelf 값도 함께 저장 (롤백 시 조회 조건 불일치 방지)
        batch.update(reqRef, { status: 'APPROVED', shelf: req.shelf || '미지정' });

        const histRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'history'));
        batch.set(histRef, { 
            ...req, actionDate: getTodayString(), status: 'APPROVED', 
            cas: req.cas || '-', originalReqId: req.id, processedAt: Date.now() 
        });

        await batch.commit();
        
    } catch (e) {
        console.error(e);
        showAlert("오류", "처리 중 문제가 발생했습니다.");
    }
  };

  const rejectRequest = async (id) => {
      if (isDemoMode) {
          setRequests(requests.map(r => r.id === id ? { ...r, status: 'REJECTED' } : r));
          return;
      }
      try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', id), { status: 'REJECTED' });
      } catch (e) {
          showAlert("오류", "반려 처리 실패");
      }
  };

  const handleDeleteRequest = (req) => {
    if (req.status === 'APPROVED') {
        showConfirm("승인 내역 삭제 (롤백)", "승인된 내역을 삭제하면 재고가 원래대로 복구됩니다. 진행하시겠습니까?", async () => {
            if (isDemoMode) {
                // ✅ 데모 모드 재고 롤백 로직 추가
                const isCheckIn_demo = req.type === 'IN';
                const rollbackAmount = Number(req.amount);
                let newInv = [...inventory];

                if (isCheckIn_demo) {
                    // 반입 롤백: 재고에서 해당 수량 차감, 0이 되면 항목 제거
                    newInv = newInv.map(item => {
                        if (item.storage === req.storage && item.shelf === req.shelf &&
                            item.chemicalName === req.chemicalName && item.labName === req.labName &&
                            item.manufacturer === req.manufacturer) {
                            return { ...item, amount: Number(item.amount) - rollbackAmount };
                        }
                        return item;
                    }).filter(item => Number(item.amount) > 0); // ✅ 0 이하는 제거
                } else {
                    // 반출 롤백: 재고 복구
                    const targetIdx = newInv.findIndex(item =>
                        item.storage === req.storage && item.shelf === req.shelf &&
                        item.chemicalName === req.chemicalName && item.labName === req.labName
                    );
                    if (targetIdx !== -1) {
                        newInv[targetIdx] = { ...newInv[targetIdx], amount: Number(newInv[targetIdx].amount) + rollbackAmount };
                    } else {
                        newInv.push({
                            id: String(Date.now()), storage: req.storage, shelf: req.shelf || '미지정',
                            chemicalName: req.chemicalName, type: req.chemType, amount: rollbackAmount,
                            unit: req.unit, manufacturer: req.manufacturer, labName: req.labName, cas: req.cas || '-'
                        });
                    }
                }

                setInventory(newInv);
                setRequests(requests.filter(r => r.id !== req.id));
                setHistory(history.filter(h => h.originalReqId !== req.id));
                showAlert("성공", "데이터가 롤백되었습니다. (데모 모드)");
                return;
            }
            try {
                const batch = writeBatch(db);
                const isCheckIn = req.type === 'IN';
                const amount = Number(req.amount);

                if (isCheckIn) {
                    // ✅ shelf 완전일치 → shelf 없이 재시도 순서로 조회 (shelf 불일치 방지)
                    let targetItem = inventory.find(item => 
                        item.storage === req.storage && 
                        (item.shelf || '미지정') === (req.shelf || '미지정') && 
                        item.chemicalName === req.chemicalName && 
                        item.labName === req.labName && 
                        item.manufacturer === req.manufacturer
                    );
                    // shelf 불일치 시 shelf 조건 제외하고 재탐색
                    if (!targetItem) {
                        targetItem = inventory.find(item => 
                            item.storage === req.storage && 
                            item.chemicalName === req.chemicalName && 
                            item.labName === req.labName && 
                            item.manufacturer === req.manufacturer
                        );
                    }
                    // 그래도 없으면 물질명+저장소만으로 탐색
                    if (!targetItem) {
                        targetItem = inventory.find(item => 
                            item.storage === req.storage && 
                            item.chemicalName === req.chemicalName && 
                            item.labName === req.labName
                        );
                    }
                    if (targetItem) {
                        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', targetItem.id);
                        const newAmount = Number(targetItem.amount) - amount;
                        if (newAmount < 0) { 
                            showAlert("오류", "현재 재고가 롤백할 수량보다 적습니다."); return; 
                        }
                        if (newAmount === 0) {
                            batch.delete(docRef); // ✅ amount=0이면 문서 완전 삭제
                        } else {
                            batch.update(docRef, { amount: newAmount });
                        }
                    } else {
                        // ✅ targetItem을 못 찾아도 requests/history는 계속 삭제
                        console.warn("[롤백] 재고 항목을 찾지 못했습니다:", req.chemicalName, req.labName);
                    }
                } else {
                    // ✅ 반출 롤백도 shelf 유연 탐색
                    let targetItem = inventory.find(item => 
                        item.storage === req.storage && 
                        (item.shelf || '미지정') === (req.shelf || '미지정') && 
                        item.chemicalName === req.chemicalName && 
                        item.labName === req.labName
                    );
                    if (!targetItem) {
                        targetItem = inventory.find(item => 
                            item.storage === req.storage && 
                            item.chemicalName === req.chemicalName && 
                            item.labName === req.labName
                        );
                    }
                    if (targetItem) {
                        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', targetItem.id);
                        batch.update(docRef, { amount: Number(targetItem.amount) + amount });
                    } else {
                        // ✅ 재고가 없으면 새로 생성 (반출된 수량 복구)
                        const docRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory'));
                        batch.set(docRef, {
                            storage: req.storage, shelf: req.shelf || '미지정',
                            chemicalName: req.chemicalName, type: req.chemType || '미지정',
                            amount: amount, unit: req.unit, manufacturer: req.manufacturer || '',
                            labName: req.labName, cas: req.cas || '-'
                        });
                    }
                }

                batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
                const relatedHistory = history.filter(h => h.originalReqId === req.id);
                relatedHistory.forEach(h => {
                    batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'history', h.id));
                });

                await batch.commit();
                showAlert("성공", "데이터가 롤백되었습니다.");

            } catch (e) {
                console.error(e);
                showAlert("오류", "롤백 실패");
            }
        });
    } else {
        showConfirm("삭제", "신청 내역을 삭제하시겠습니까?", async () => {
            if (isDemoMode) {
                setRequests(requests.filter(r => r.id !== req.id));
                return;
            }
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
            } catch(e) { showAlert("오류", "삭제 실패"); }
        });
    }
  };

  const handleSaveMasterData = async () => {
    if (masterAddModal.type === 'lab') {
        if (!newLabData.name) return showAlert("오류", "실험실명을 입력하세요.");
        if (isDemoMode) setLabs([...labs, { id: String(Date.now()), ...newLabData }]);
        else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'labs'), newLabData);
        setNewLabData({ name: '', loc: '', ext: '', storage: '제1공학관' });
    } else if (masterAddModal.type === 'chemical') {
        if (!newChemData.name) return showAlert("오류", "물질명을 입력하세요.");
        if (isDemoMode) setChemicals([...chemicals, { id: String(Date.now()), ...newChemData }]);
        else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chemicals'), newChemData);
        setNewChemData({ cas: '', name: '', type: '1석유류(비)' });
    } else if (masterAddModal.type === 'manufacturer') {
        if (!newManufacturer) return showAlert("오류", "제조사명을 입력하세요.");
        if (manufacturers.some(m => m.name === newManufacturer)) return showAlert("오류", "이미 존재합니다.");
        if (isDemoMode) setManufacturers([...manufacturers, { id: String(Date.now()), name: newManufacturer }]);
        else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'manufacturers'), { name: newManufacturer });
        setNewManufacturer('');
    }
    setMasterAddModal({ isOpen: false, type: '' });
    showAlert("성공", "저장되었습니다.");
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
        const type = String(parts[0] || '').trim().toUpperCase();
        const storage = String(parts[1] || '').trim();
        const labName = String(parts[2] || '').trim();
        const chemicalName = String(parts[3] || '').trim();
        const amount = parseFloat(String(parts[4] || '').trim());
        const unit = String(parts[5] || 'L').trim();
        const manufacturer = String(parts[6] || '').trim();
        const requestorName = String(parts[7] || '').trim();

        const rowErrors = [];
        if (!['IN','OUT'].includes(type)) rowErrors.push(`유형(IN/OUT) 오류`);
        if (!STORAGES.includes(storage)) rowErrors.push(`저장소 오류: "${storage}"`);
        if (!labName) rowErrors.push(`실험실명 누락`);
        if (!chemicalName) rowErrors.push(`물질명 누락`);
        if (isNaN(amount) || amount <= 0) rowErrors.push(`수량 오류: "${parts[4]}"`);
        if (!UNITS.includes(unit)) rowErrors.push(`단위 오류(${UNITS.join('/')})`);
        if (!requestorName) rowErrors.push(`신청자 성명 누락`);

        const chem = chemicals.find(c => c.name === chemicalName);
        const lab = labs.find(l => l.name === labName);
        const ext = lab ? lab.ext : '';

        if (rowErrors.length > 0) {
          errors.push({ rowNum, errors: rowErrors, data: parts });
        } else {
          parsed.push({
            _rowNum: rowNum,
            _valid: true,
            type: type,
            storage,
            labName,
            ext,
            chemicalName,
            chemType: chem ? chem.type : '미지정',
            cas: chem ? chem.cas : '-',
            amount: String(amount),
            unit,
            manufacturer,
            requestorName,
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
    for (const row of bulkImportRows) {
      const newRequest = {
        createdAt: Date.now() + successCount,
        status: 'PENDING',
        date: getTodayString(),
        type: row.type,
        storage: row.storage,
        labName: row.labName,
        ext: row.ext,
        chemicalName: row.chemicalName,
        chemType: row.chemType,
        cas: row.cas,
        amount: row.amount,
        unit: row.unit,
        manufacturer: row.manufacturer,
        requestorName: row.requestorName,
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
      }
    }
    setBulkImportModal(false);
    setBulkImportRows([]);
    setBulkImportErrors([]);
    showAlert("완료", `${successCount}건이 신청 대기 목록에 등록되었습니다.`);
    navigateTo('my_requests');
  };

  // --- View Components ---
  const renderModal = () => {
      if (!modal.isOpen) return null;
      return (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95">
                  <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${modal.type === 'confirm' ? 'text-orange-600' : 'text-blue-600'}`}>
                      {modal.type === 'confirm' ? <AlertTriangle size={24}/> : <Info size={24}/>} {modal.title}
                  </h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">{modal.message}</p>
                  <div className="flex gap-3 justify-end">
                      {modal.type === 'confirm' && <button onClick={closeModal} className="px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 font-medium">취소</button>}
                      <button onClick={() => { if(modal.onConfirm) modal.onConfirm(); closeModal(); }} className={`px-4 py-2 text-white rounded-lg font-medium ${modal.type === 'confirm' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>확인</button>
                  </div>
              </div>
          </div>
      );
  };

  const renderBulkImportModal = () => {
    if (!bulkImportModal) return null;
    const SAMPLE_URL = "data:text/csv;charset=utf-8,\uFEFF유형(IN/OUT),저장소,실험실명,물질명,수량,단위(L/kg/mL/g/Can/Bottle),제조사,신청자성명\nIN,제1공학관,연구실A,Acetone,5,L,삼전순약공업,홍길동\nOUT,제1공학관,연구실A,Acetone,2,L,,홍길동";
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
                <strong>컬럼 순서:</strong> 유형(IN/OUT) | 저장소 | 실험실명 | 물질명 | 수량 | 단위 | 제조사 | 신청자성명
              </div>
            </div>

            {/* 오류 목록 */}
            {bulkImportErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h4 className="font-bold text-red-700 mb-2 flex items-center gap-2"><AlertTriangle size={16}/> {bulkImportErrors.length}건 오류 (자동 제외됨)</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {bulkImportErrors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600 bg-white rounded p-1.5 border border-red-100">
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
                        {['#','유형','저장소','실험실','물질명','수량','단위','제조사','신청자'].map(h => (
                          <th key={h} className="p-2 text-left font-bold text-slate-600 whitespace-nowrap">{h}</th>
                        ))}
                        <th className="p-2">제거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportRows.map((row, i) => (
                        <tr key={i} className={`border-t ${i%2===0?'bg-white':'bg-slate-50'}`}>
                          <td className="p-2 text-slate-400">{row._rowNum}</td>
                          <td className="p-2"><span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${row.type==='IN'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{row.type==='IN'?'반입':'반출'}</span></td>
                          <td className="p-2 whitespace-nowrap">{row.storage}</td>
                          <td className="p-2 whitespace-nowrap">{row.labName}</td>
                          <td className="p-2 font-bold whitespace-nowrap">{row.chemicalName}</td>
                          <td className="p-2 text-right">{row.amount}</td>
                          <td className="p-2">{row.unit}</td>
                          <td className="p-2">{row.manufacturer || '-'}</td>
                          <td className="p-2">{row.requestorName}</td>
                          <td className="p-2 text-center">
                            <button onClick={() => setBulkImportRows(prev => prev.filter((_,idx) => idx !== i))} className="text-red-400 hover:text-red-600"><X size={14}/></button>
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
      {renderModal()}
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
            <button onClick={() => { setCurrentUser('user'); navigateTo('request'); }} className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
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
                  <input type="password" placeholder="비밀번호" className="w-full border p-3 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-slate-500" autoFocus value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()} />
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
                <div className={`w-2 h-2 rounded-full ${firebaseInitialized ? (isDemoMode ? 'bg-orange-500' : 'bg-green-500') : 'bg-red-500'}`}></div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {firebaseInitialized ? (isDemoMode ? 'Offline Demo' : 'Online') : 'Connecting...'}
                </span>
            </div>
          </div>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}><X size={24}/></button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {currentUser === 'admin' ? (
            <>
              <NavItem tab="dashboard" icon={LayoutDashboard} label="대시보드" />
              <NavItem tab="notices" icon={Megaphone} label="공지사항 관리" badge={notices.filter(n=>n.important).length} />
              <NavItem tab="public_status" icon={FlaskConical} label="보관 현황 및 백업" />
              <NavItem tab="admin_inventory" icon={ClipboardList} label="재고 현황 조회·내보내기" />
              <NavItem tab="safety_status" icon={BarChart3} label="성상별 통계" />
              <NavItem tab="approvals" icon={CheckCircle} label="승인 대기/관리" badge={requests.filter(r => r.status === 'PENDING').length} />
              <NavItem tab="history" icon={ArrowRightLeft} label="반출입 기록 조회" />
              <NavItem tab="masterData" icon={Database} label="기초 데이터 관리" />
            </>
          ) : (
            <>
              <NavItem tab="request" icon={PackagePlus} label="반출/반입 신청" />
              <NavItem tab="my_requests" icon={History} label="내 신청 내역" />
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
      ? chemicals.filter(chem => chem.name.toLowerCase().includes(requestForm.chemicalName.toLowerCase())).sort((a,b) => a.name.localeCompare(b.name))
      : [...chemicals].sort((a,b) => a.name.localeCompare(b.name));

    return (
      <div className="max-w-3xl mx-auto bg-white p-4 md:p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6 border-b pb-4">
          <h2 className="text-2xl font-bold text-slate-800">위험물 반출/반입 신청서</h2>
          <button 
            onClick={() => { setBulkImportRows([]); setBulkImportErrors([]); setBulkImportModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold text-sm shadow transition"
          >
            <FileSpreadsheet size={16}/> 엑셀 일괄 등록
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">신청 유형</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                    {['IN', 'OUT'].map(t => (
                        <button key={t} onClick={() => setRequestForm({...requestForm, type: t})} className={`flex-1 py-2 rounded-md text-sm font-bold transition ${requestForm.type === t ? (t === 'IN' ? 'bg-white text-green-700 shadow-sm' : 'bg-white text-red-700 shadow-sm') : 'text-slate-400 hover:text-slate-600'}`}>
                            {t === 'IN' ? '반입 (입고)' : '반출 (출고)'}
                        </button>
                    ))}
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
            <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-sm font-bold text-slate-700">신청자 성명 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="반출입을 신청하는 분의 성명을 입력하세요"
                  value={requestForm.requestorName}
                  onChange={e => setRequestForm({...requestForm, requestorName: e.target.value})}
                />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                  ✍️ 신청자 서명 <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-slate-400 ml-2">(손가락 또는 마우스로 서명하세요)</span>
                </label>
                <SignaturePad
                  key={signaturePadKey}
                  resetKey={signaturePadKey}
                  onSave={(data) => setSignatureData(data)}
                  onClear={() => setSignatureData('')}
                />
                {signatureData && (
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">✅ 서명이 완료되었습니다.</p>
                )}
            </div>
        </div>

        <div className="space-y-4 mb-8">
             <div className="flex flex-col gap-2 relative">
                <label className="text-sm font-bold text-slate-700">물질명 검색</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                            placeholder="물질명 입력 또는 🔍 버튼으로 목록 검색" 
                            value={requestForm.chemicalName} 
                            onChange={(e) => { setRequestForm({...requestForm, chemicalName: e.target.value}); setIsChemDropdownOpen(true); }}
                            onFocus={() => setIsChemDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setIsChemDropdownOpen(false), 200)}
                        />
                        {isChemDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto z-10">
                                {filteredChemicals.length > 0 ? filteredChemicals.map((chem, idx) => (
                                    <button 
                                        key={idx} 
                                        className="w-full text-left p-3 hover:bg-blue-50 text-sm border-b last:border-b-0 flex justify-between items-center"
                                        onMouseDown={(e) => { e.preventDefault(); setRequestForm({...requestForm, chemicalName: chem.name, chemType: chem.type, cas: chem.cas}); setIsChemDropdownOpen(false); }}
                                    >
                                        <span className="font-bold text-slate-700">{chem.name}</span>
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
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-700">수량</label>
                    <input type="number" className="border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="0.0" value={requestForm.amount} onChange={(e) => setRequestForm({...requestForm, amount: e.target.value})} />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-700">단위</label>
                    <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" value={requestForm.unit} onChange={(e) => setRequestForm({...requestForm, unit: e.target.value})}>
                        {['L', 'kg', 'mL', 'g', 'Can', 'Bottle'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
            </div>
             <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">제조사</label>
                <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" value={requestForm.manufacturer} onChange={(e) => setRequestForm({...requestForm, manufacturer: e.target.value})}>
                    <option value="">선택해주세요</option>
                    {[...manufacturers].sort((a,b) => a.name.localeCompare(b.name, 'ko')).map((m, idx) => (
                        <option key={idx} value={m.name}>{m.name}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={() => submitRequest(false)} className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition transform active:scale-95 ${requestForm.type === 'IN' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
            {requestForm.type === 'IN' ? '📦 반입 신청 완료 (내역으로 이동)' : '📤 반출 신청 완료 (내역으로 이동)'}
          </button>
          <button onClick={() => submitRequest(true)} className={`w-full py-3 rounded-xl font-bold text-base border-2 transition transform active:scale-95 ${requestForm.type === 'IN' ? 'border-green-600 text-green-700 hover:bg-green-50' : 'border-red-600 text-red-700 hover:bg-red-50'} bg-white`}>
            ➕ 이어서 다른 물질 신청 (저장소·실험실 유지)
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
        const type = item.type || '기타';
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
             <p className="text-3xl font-bold text-orange-600">{requests.filter(r => r.status === 'PENDING').length} <span className="text-sm font-normal text-slate-400">건</span></p>
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
                            {tableData.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
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
    const allChemTypes = [...new Set(inventory.map(i => i.chemType || '미지정').filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));

    const filteredInv = inventory.filter(i => {
      const activeAmount = Number(i.amount) > 0;
      const matchStorage = invFilter.storage === 'All' || i.storage === invFilter.storage;
      const matchLab = invFilter.labName === 'All' || i.labName === invFilter.labName;
      const matchType = invFilter.chemType === 'All' || (i.chemType || '미지정') === invFilter.chemType;
      return activeAmount && matchStorage && matchLab && matchType;
    }).sort((a,b) => {
      const dir = invSort.dir === 'asc' ? 1 : -1;
      const key = invSort.key;
      // 성상(chemType) 정렬은 물질명(chemicalName) 기준으로 처리
      const getVal = item => {
        if (key === 'chemType') return item.chemicalName || '';
        return item[key] || '';
      };
      return getVal(a).localeCompare(getVal(b), 'ko', {numeric: true}) * dir;
    });
    const toggleSort = (key) => setInvSort(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    const sortIcon = (key) => invSort.key === key ? (invSort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    const downloadInventoryCSV = () => {
      const header = "저장소,실험실,선반,물질명,CAS No.,성상,수량,단위,제조사\n";
      const rows = filteredInv.map(i => {
        const chem = chemicals.find(c => c.name === i.chemicalName);
        const cas = (chem ? chem.cas : i.cas) || '-';
        const ct = i.chemType || (chem ? chem.type : '미지정') || '미지정';
        // ="값" 형식 → 엑셀 텍스트 강제, 쉼표 포함 필드도 안전
        const safeT = v => `="` + String(v||'-').replace(/"/g, '""') + '"';
        const safeN = v => String(v||'-'); // 수량은 숫자 그대로
        return [safeT(i.storage), safeT(i.labName), safeT(i.shelf||'미지정'), safeT(i.chemicalName), safeT(cas), safeT(ct), safeN(i.amount), safeT(i.unit), safeT(i.manufacturer)].join(',');
      }).join("\n");
      const today = getTodayString();
      downloadCSV(header + rows, `재고현황_${today}.csv`);
    };

    return (
      <div className="space-y-4 md:space-y-6">
        <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ClipboardList className="text-blue-600" /> 재고 현황 조회·내보내기
        </h2>

        {/* 필터 영역 */}
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">성상(물질종류)</label>
              <select className="border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500"
                value={invFilter.chemType}
                onChange={e => setInvFilter(f => ({...f, chemType: e.target.value}))}>
                <option value="All">전체 성상</option>
                {allChemTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <p className="text-sm text-slate-500">검색 결과: <strong className="text-slate-800">{filteredInv.length}건</strong></p>
            <button
              onClick={downloadInventoryCSV}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition">
              <Download size={16}/> 엑셀(CSV) 다운로드
            </button>
          </div>
        </div>

        {/* 재고 목록 테이블 */}
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {[
                    {label:'저장소', key:'storage'},
                    {label:'실험실', key:'labName'},
                    {label:'선반',   key:'shelf'},
                    {label:'물질명', key:'chemicalName'},
                    {label:'CAS No.', key:null},
                    {label:'성상',   key:'chemType'},
                    {label:'수량',   key:null},
                    {label:'단위',   key:null},
                    {label:'제조사', key:null},
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
                  <tr><td colSpan={9} className="p-8 text-center text-slate-400">해당 조건의 재고가 없습니다.</td></tr>
                ) : filteredInv.map((item, idx) => {
                  const chem = chemicals.find(c => c.name === item.chemicalName);
                  const cas = (chem ? chem.cas : item.cas) || '-';
                  const ct = item.chemType || (chem ? chem.type : '미지정') || '미지정';
                  return (
                    <tr key={idx} className="hover:bg-blue-50 transition">
                      <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{item.storage}</td>
                      <td className="p-3 font-medium text-slate-800 whitespace-nowrap">{item.labName}</td>
                      <td className="p-3 text-blue-600 font-bold whitespace-nowrap">{item.shelf || '미지정'}</td>
                      <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{item.chemicalName}</td>
                      <td className="p-3 text-xs text-slate-400 whitespace-nowrap font-mono">{cas}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{ct}</span>
                      </td>
                      <td className="p-3 font-bold text-right text-blue-700 whitespace-nowrap">{item.amount}</td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{item.unit}</td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">{item.manufacturer || '-'}</td>
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
    const shelfGrouped = Object.values(filteredInventory.reduce((acc, item) => {
        const key = `${item.storage}_${item.shelf}_${item.chemicalName}`;
        if (!acc[key]) acc[key] = { ...item, amount: Number(item.amount) };
        else acc[key].amount += Number(item.amount);
        return acc;
    }, {})).sort((a,b) => (a.shelf||'미지정').localeCompare(b.shelf||'미지정','ko',{numeric:true}));
    const labGrouped = [...new Set(filteredInventory.map(i => i.labName).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));

    const openShelfDetail = (item) => {
        const sameItems = inventory.filter(i => i.chemicalName === item.chemicalName && i.storage === item.storage && i.shelf === item.shelf);
        const breakdown = {};
        sameItems.forEach(i => { breakdown[i.manufacturer] = (breakdown[i.manufacturer] || 0) + Number(i.amount); });
        setSelectedChemDetail({ name: item.chemicalName, storage: item.storage, shelf: item.shelf, unit: item.unit, breakdown });
    };

    return (
      <div className="space-y-4 md:space-y-6">
         <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><FlaskConical className="text-blue-600" /> 위험물 보관 현황</h2>
         <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2 w-full md:w-auto">
                <Filter size={18} className="text-slate-500"/>
                <select className="border p-2 rounded flex-1 md:flex-none" value={filterStorage} onChange={e => setFilterStorage(e.target.value)}>
                    <option value="All">전체 저장소</option>
                    {[...new Set(inventory.map(i=>i.storage))].sort().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <p className="text-xs text-slate-500 md:ml-auto flex items-center gap-1 bg-slate-100 p-2 rounded w-full md:w-auto"><Info size={14}/> 목록 터치 시 제조사 정보를 봅니다.</p>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
             <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-[500px]">
                <h3 className="text-lg font-bold p-4 bg-slate-50 border-b text-slate-700">📍 선반별 합산 현황</h3>
                <div className="overflow-x-auto overflow-y-auto flex-1 p-2">
                    <table className="w-full text-sm text-left min-w-[300px] whitespace-nowrap">
                        <thead className="text-slate-400 sticky top-0 bg-white">
                            <tr><th className="p-2">선반</th><th className="p-2">물질명</th><th className="p-2 text-right">총량</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {shelfGrouped.map((item, idx) => (
                                <tr key={idx} className="hover:bg-blue-50 cursor-pointer" onClick={() => openShelfDetail(item)}>
                                    <td className="p-2"><div className="text-xs text-slate-500">{item.storage}</div><div className="font-bold text-blue-600">{item.shelf}</div></td>
                                    <td className="p-2 font-medium">{item.chemicalName}</td>
                                    <td className="p-2 text-right font-bold text-blue-700">{item.amount}{item.unit} <ChevronRight size={14} className="inline text-slate-300"/></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>

             <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-[500px]">
                <h3 className="text-lg font-bold p-4 bg-slate-50 border-b text-slate-700">🧪 실험실별 전체 보기</h3>
                <div className="overflow-y-auto flex-1 p-2">
                    <ul className="divide-y divide-slate-100">
                        {labGrouped.map((lab, idx) => (
                            <li key={idx} className="p-4 hover:bg-slate-50 flex justify-between items-center cursor-pointer" onClick={() => setSelectedLabDetail({ labName: lab, sortKey: 'shelf', sortDir: 'asc', items: inventory.filter(i => i.labName === lab && Number(i.amount) > 0) })}>
                                <span className="font-bold text-slate-700 truncate mr-2">{lab}</span>
                                <button className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold flex-shrink-0">보유 목록</button>
                            </li>
                        ))}
                    </ul>
                </div>
             </div>
         </div>

         {/* 상세 모달들 */}
         {selectedChemDetail && (
             <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedChemDetail(null)}>
                 <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                     <h3 className="text-xl font-bold text-slate-800">{selectedChemDetail.name}</h3>
                     <p className="text-sm text-slate-500 mb-4">{selectedChemDetail.storage} <span className="font-bold text-blue-600">{selectedChemDetail.shelf}</span></p>
                     <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                         {Object.entries(selectedChemDetail.breakdown).map(([man, amt]) => (
                             <div key={man} className="flex justify-between items-center text-sm">
                                 <span className="text-slate-700 font-medium">{man}</span>
                                 <span className="font-bold bg-white px-2 py-1 rounded border shadow-sm text-blue-700">{amt} {selectedChemDetail.unit}</span>
                             </div>
                         ))}
                     </div>
                     <button onClick={() => setSelectedChemDetail(null)} className="mt-6 w-full py-3 bg-slate-800 text-white rounded-lg font-bold">닫기</button>
                 </div>
             </div>
         )}
         {selectedLabDetail && (
             <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLabDetail(null)}>
                 <div className="bg-white p-4 md:p-6 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                     <h3 className="text-lg md:text-xl font-bold text-slate-800 border-b pb-3">{selectedLabDetail.labName} 보유품목</h3>
                     <div className="mt-4 flex-1 overflow-x-auto overflow-y-auto">
                         <table className="w-full text-sm text-left min-w-[400px] whitespace-nowrap">
                             <thead className="bg-slate-50 sticky top-0">
                               <tr>
                                 <th className="p-2 cursor-pointer select-none hover:bg-slate-100 transition"
                                   onClick={() => setSelectedLabDetail(prev => ({
                                     ...prev,
                                     sortKey: 'shelf',
                                     sortDir: prev.sortKey === 'shelf' ? (prev.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
                                   }))}>
                                   선반 {selectedLabDetail.sortKey === 'shelf' ? (selectedLabDetail.sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                                 </th>
                                 <th className="p-2 cursor-pointer select-none hover:bg-slate-100 transition"
                                   onClick={() => setSelectedLabDetail(prev => ({
                                     ...prev,
                                     sortKey: 'chemicalName',
                                     sortDir: prev.sortKey === 'chemicalName' ? (prev.sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
                                   }))}>
                                   물질명/제조사 {selectedLabDetail.sortKey === 'chemicalName' ? (selectedLabDetail.sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                                 </th>
                                 <th className="p-2 text-right">수량</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y">
                                 {[...selectedLabDetail.items].sort((a, b) => {
                                   const key = selectedLabDetail.sortKey || 'shelf';
                                   const dir = selectedLabDetail.sortDir === 'desc' ? -1 : 1;
                                   const va = (a[key] || '').toString();
                                   const vb = (b[key] || '').toString();
                                   return dir * va.localeCompare(vb, 'ko', {numeric: true});
                                 }).map((item, idx) => (
                                     <tr key={idx}><td className="p-2 font-bold text-blue-600">{item.shelf}</td><td className="p-2"><div className="font-bold">{item.chemicalName}</div><div className="text-xs text-slate-500">{item.manufacturer}</div></td><td className="p-2 text-right font-medium">{item.amount}{item.unit}</td></tr>
                                 ))}
                             </tbody>
                         </table>
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
        const typeKey = item.type || '미분류';
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
                                                    {[...breakdownData[storageName][type]].sort((a,b) => (a.name||'').localeCompare(b.name||'','ko')).map((detail, idx) => (
                                                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-slate-100">
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
    if (isDemoMode) {
      setRequests(requests.map(r => r.id === updated.id ? updated : r));
    } else {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', updated.id), updated);
      } catch(e) { showAlert("오류", "수정 저장 실패"); }
    }
    setEditingRequest(null);
    showAlert("완료", "신청 내역이 수정되었습니다.");
  };

  // ── 기록 수정 ──
  const saveEditedHistory = async (updated) => {
    const { id, ...data } = updated;
    if (isDemoMode) {
      setHistory(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
    } else {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'history', id), data);
      } catch(e) { showAlert('오류', '기록 수정에 실패했습니다.'); return; }
    }
    setEditHistoryItem(null);
    showAlert('완료', '기록이 수정되었습니다.');
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
      setNotices(prev => [{ ...newNotice, id: String(Date.now()) }, ...prev]);
    } else {
      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notices'), newNotice);
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
      } catch(e) { showAlert('오류', '삭제 실패'); }
    });
  };

  const renderApprovalScreen = () => {
    const pendingReqs = requests.filter(req => req.status === 'PENDING');
    const allReqs = requests;
    // approvalViewTab은 이제 컴포넌트 레벨 state 사용 (훅 위반 수정)
    const displayReqs = approvalViewTab === 'pending' ? pendingReqs : allReqs;

    return (
    <div className="space-y-4">
      <h2 className="text-xl md:text-2xl font-bold text-slate-800">승인 대기 / 관리</h2>

      {/* 탭 전환 */}
      <div className="flex gap-2">
        <button onClick={() => setApprovalViewTab('pending')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${approvalViewTab === 'pending' ? 'bg-orange-500 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
          대기 중 <span className="ml-1 bg-white text-orange-500 px-1.5 py-0.5 rounded-full text-xs font-bold">{pendingReqs.length}</span>
        </button>
        <button onClick={() => setApprovalViewTab('all')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${approvalViewTab === 'all' ? 'bg-slate-700 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
          전체 내역
        </button>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-2 md:p-3">구분</th>
              <th className="p-2 md:p-3">신청자</th>
              <th className="p-2 md:p-3">저장소/실험실</th>
              <th className="p-2 md:p-3">물질/수량</th>
              <th className="p-2 md:p-3">상태</th>
              <th className="p-2 md:p-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayReqs.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">항목이 없습니다.</td></tr>
            ) : (
                displayReqs.map(req => (
                <tr key={req.id} className={req.status === 'PENDING' ? 'bg-blue-50/30' : req.status === 'APPROVED' ? 'bg-green-50/20' : 'bg-red-50/10'}>
                    <td className="p-2 md:p-3"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${req.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{req.type === 'IN' ? '반입' : '반출'}</span></td>
                    <td className="p-2 md:p-3 font-medium text-slate-700 text-xs">{req.requestorName ? <span className="flex items-center gap-1">{req.signature && <span title="서명있음" className="text-green-500">✍️</span>}{req.requestorName}</span> : <span className="text-slate-300 text-xs">-</span>}</td>
                    <td className="p-2 md:p-3"><div className="font-bold text-xs">{req.storage}</div><div className="text-xs text-slate-500">{req.labName}</div></td>
                    <td className="p-2 md:p-3"><div className="font-bold text-xs">{req.chemicalName}</div><div className="text-xs text-blue-600">{req.amount}{req.unit}</div><div className="text-xs text-slate-400">{req.manufacturer}</div></td>

                    <td className="p-2 md:p-3">
                      {req.status === 'PENDING' && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">대기중</span>}
                      {req.status === 'APPROVED' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">승인됨</span>}
                      {req.status === 'REJECTED' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">반려됨</span>}
                    </td>
                    <td className="p-2 md:p-3 text-center">
                        <div className="flex justify-center gap-1">
                        {req.status === 'PENDING' && <>
                          <button onClick={() => setEditingRequest({...req})} className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition" title="내용 수정"><Edit2 size={15}/></button>
                          <button onClick={() => approveRequest(req)} className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition" title="승인"><CheckCircle size={15}/></button>
                          <button onClick={() => rejectRequest(req.id)} className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition" title="거절"><XCircle size={15}/></button>
                        </>}
                        {req.status !== 'PENDING' && (
                          <button onClick={() => handleDeleteRequest(req)} className="p-1.5 bg-slate-100 text-slate-500 rounded hover:bg-red-100 hover:text-red-600 transition" title="삭제/롤백"><Trash2 size={15}/></button>
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
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2"><Edit2 size={20} className="text-blue-600"/> 신청 내역 수정</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">신청 유형</label>
                  <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.type} onChange={e=>setEditingRequest({...editingRequest, type: e.target.value})}>
                    <option value="IN">반입 (입고)</option>
                    <option value="OUT">반출 (출고)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">신청자 성명</label>
                  <input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.requestorName || ''} onChange={e=>setEditingRequest({...editingRequest, requestorName: e.target.value})} placeholder="성명 입력"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">물질명</label>
                <input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.chemicalName} onChange={e=>setEditingRequest({...editingRequest, chemicalName: e.target.value})}/>
              </div>
              <div className="grid grid-cols-3 gap-3">
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
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">선반</label>
                  <input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.shelf === '미지정' ? '' : editingRequest.shelf} onChange={e=>setEditingRequest({...editingRequest, shelf: e.target.value || '미지정'})} placeholder="선반 번호"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">성상(물질 유형)</label>
                <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.chemType || ''} onChange={e=>setEditingRequest({...editingRequest, chemType: e.target.value})}>
                  {['1석유류(비)', '1석유류(수)', '알코올류', '2석유류(비)', '2석유류(수)', '3석유류(비)', '3석유류(수)', '4석유류', '동식물유', '특수인화물', '유독물질', '해당없음'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">제조사</label>
                <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={editingRequest.manufacturer} onChange={e=>setEditingRequest({...editingRequest, manufacturer: e.target.value})}>
                  <option value="">선택</option>
                  {manufacturers.map((m,i) => <option key={i} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setEditingRequest(null)} className="px-4 py-2 bg-slate-200 rounded-lg font-medium hover:bg-slate-300">취소</button>
              <button onClick={() => saveEditedRequest(editingRequest)} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );};

  const renderMyRequestsScreen = () => (
    <div className="space-y-4">
      <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><History className="text-blue-600"/> 내 신청 내역</h2>
      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[550px]">
          <thead className="bg-slate-50 border-b">
            <tr>
                <th className="p-2 md:p-3">신청일</th>
                <th className="p-2 md:p-3">구분</th>
                <th className="p-2 md:p-3">신청자</th>
                <th className="p-2 md:p-3">저장소 / 실험실</th>
                <th className="p-2 md:p-3">물질/수량</th>
                <th className="p-2 md:p-3 text-center">상태</th>
                <th className="p-2 md:p-3 text-center">삭제</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map(req => (
              <tr key={req.id} className="hover:bg-slate-50 transition">
                <td className="p-2 md:p-3 text-xs text-slate-600">{req.date}</td>
                <td className="p-2 md:p-3"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${req.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{req.type === 'IN' ? '반입' : '반출'}</span></td>
                <td className="p-2 md:p-3 text-xs font-medium text-slate-700">
                  {req.signature && <span title="서명있음" className="inline-block mr-1 text-green-500">✍️</span>}
                  {req.requestorName || <span className="text-slate-300">-</span>}
                </td>
                <td className="p-2 md:p-3">
                    <div className="font-bold text-xs text-slate-700">{req.storage}</div>
                    <div className="text-xs text-slate-500">{req.labName}</div>
                </td>
                <td className="p-2 md:p-3">
                    <div className="font-bold text-xs text-slate-800">{req.chemicalName} <span className="text-blue-600 text-xs bg-blue-50 px-1 py-0.5 rounded border border-blue-100">{req.amount}{req.unit}</span></div>
                    <div className="text-xs text-slate-500">{req.manufacturer}</div>
                </td>
                <td className="p-2 md:p-3 text-center">
                    {req.status === 'PENDING' && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">대기중</span>}
                    {req.status === 'APPROVED' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">승인됨</span>}
                    {req.status === 'REJECTED' && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">반려됨</span>}
                </td>
                <td className="p-2 md:p-3 text-center">
                    {req.status === 'PENDING' && (
                        <button onClick={() => handleDeleteRequest(req)} className="text-red-500 p-1.5 bg-red-50 rounded hover:bg-red-100 transition" title="신청 취소/삭제"><Trash2 size={16}/></button>
                    )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">신청 내역이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHistoryScreen = () => {
    const filteredHistory = history.filter(h => {
        if (historyFilter.type !== 'All' && h.type !== historyFilter.type) return false;
        if (historyFilter.storage !== 'All' && h.storage !== historyFilter.storage) return false;
        
        // [수정] 날짜 범위 필터링 로직
        // 시작일이 설정되어 있고, 기록 날짜가 시작일보다 전이면 제외
        if (historyFilter.startDate && h.actionDate < historyFilter.startDate) return false;
        // 종료일이 설정되어 있고, 기록 날짜가 종료일보다 후면 제외
        if (historyFilter.endDate && h.actionDate > historyFilter.endDate) return false;
        
        return true;
    });

    return (
        <>
        <div className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft className="text-blue-600"/> 반출입 기록 조회</h2>
            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-3 items-center">
                {/* [수정] 날짜 범위 선택 필터 UI */}
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
                            onClick={() => setHistoryFilter({...historyFilter, startDate: '', endDate: ''})} 
                            className="ml-1 text-slate-400 hover:text-red-500 transition"
                            title="날짜 초기화"
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
                    {['제1공학관', '제1과학기술관', '동물실험동'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="ml-auto w-full md:w-auto">
                    <div className="flex gap-2 flex-wrap w-full md:w-auto">
                    <button onClick={() => {
                        const csvHeader = "일자,구분,신청자,저장소,선반,실험실,물질명,CAS No.,성상,수량,제조사,서명\n";
                        const csvData = filteredHistory.map(h => {
                            const chemInfo = chemicals.find(c => c.name === h.chemicalName) || {};
                            const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                            const chemType = h.chemType || chemInfo.type || '-';
                            const shelfInfo = h.shelf || '미지정';
                            // ="값" 형식으로 날짜 인식 방지, 쉼표 필드 안전 처리
                            const sT = v => `="` + String(v||'-').replace(/"/g, '""') + '"';
                            return [sT(h.actionDate), sT(h.type==='IN'?'반입':'반출'), sT(h.requestorName||'-'), sT(h.storage), sT(shelfInfo), sT(h.labName), sT(h.chemicalName), sT(casNo), sT(chemType), sT(`${h.amount}${h.unit}`), sT(h.manufacturer), sT(h.signature ? '[서명있음]' : '-')].join(',');
                        }).join("\n");
                        downloadCSV(csvHeader + csvData, "history.csv");
                    }} className="flex-1 md:flex-none px-4 py-2 bg-green-600 text-white rounded font-bold flex items-center justify-center gap-2 hover:bg-green-700">
                        <Download size={16}/> CSV 다운로드
                    </button>
                    <button onClick={() => {
                        // 서명 이미지 포함 HTML 파일 생성 (엑셀에서도 열 수 있음)
                        const rows = filteredHistory.map(h => {
                            const chemInfo = chemicals.find(c => c.name === h.chemicalName) || {};
                            const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                            const chemType = h.chemType || chemInfo.type || '-';
                            const shelfInfo = h.shelf || '미지정';
                            const signCell = h.signature
                                ? `<img src="${h.signature}" style="height:40px;max-width:120px;object-fit:contain;" alt="서명"/>`
                                : '<span style="color:#aaa">없음</span>';
                            const esc = v => String(v||'-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                            return `<tr>
                                <td>${esc(h.actionDate)}</td>
                                <td>${esc(h.type==='IN'?'반입':'반출')}</td>
                                <td>${esc(h.requestorName||'-')}</td>
                                <td>${esc(h.storage)}</td>
                                <td>${esc(shelfInfo)}</td>
                                <td>${esc(h.labName)}</td>
                                <td>${esc(h.chemicalName)}</td>
                                <td>${esc(casNo)}</td>
                                <td>${esc(chemType)}</td>
                                <td>${esc(h.amount)}${esc(h.unit)}</td>
                                <td>${esc(h.manufacturer||'-')}</td>
                                <td>${signCell}</td>
                            </tr>`;
                        }).join('');
                        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>table{border-collapse:collapse;font-family:sans-serif;font-size:12px;}
th,td{border:1px solid #ccc;padding:6px 10px;white-space:nowrap;}
th{background:#f1f5f9;font-weight:bold;}</style></head><body>
<h2 style="font-family:sans-serif">반출입 기록 조회 (서명 포함)</h2>
<table><thead><tr>
<th>처리일자</th><th>구분</th><th>신청자</th><th>저장소</th><th>선반</th>
<th>실험실</th><th>물질명</th><th>CAS No.</th><th>성상</th>
<th>수량</th><th>제조사</th><th>서명</th>
</tr></thead><tbody>${rows}</tbody></table></body></html>`;
                        const blob = new Blob([html], {type:'text/html;charset=utf-8'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'history_서명포함.html';
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a); URL.revokeObjectURL(url);
                    }} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded font-bold flex items-center justify-center gap-2 hover:bg-blue-700">
                        <Download size={16}/> 서명 포함 내보내기
                    </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="p-3">처리일자</th>
                            <th className="p-3">구분</th>
                            <th className="p-3">신청자</th>
                            <th className="p-3">저장소 / 실험실</th>
                            <th className="p-3">물질명</th>
                            <th className="p-3">수량</th>
                            <th className="p-3">제조사</th>
                            <th className="p-3 text-center">서명</th>
                            {currentUser === 'admin' && <th className="p-3 text-center">수정</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredHistory.map(h => {
                            const chemInfo = chemicals.find(c => c.name === h.chemicalName) || {};
                            const casNo = h.cas && h.cas !== '-' ? h.cas : (chemInfo.cas || '-');
                            const chemType = h.chemType || chemInfo.type || '-';
                            const shelfInfo = h.shelf || '미지정';

                            return (
                                <tr key={h.id} className="hover:bg-slate-50">
                                    <td className="p-3 text-slate-600">{h.actionDate}</td>
                                    <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${h.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{h.type === 'IN' ? '반입' : '반출'}</span></td>
                                    <td className="p-3 font-medium text-slate-700">{h.requestorName || <span className="text-slate-300 text-xs">-</span>}</td>
                                    <td className="p-3">
                                        <div className="font-bold flex items-center gap-2">
                                            {h.storage}
                                            <span className="text-blue-600 text-xs bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-normal">
                                                선반: {shelfInfo}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">{h.labName}</div>
                                    </td>
                                    <td className="p-3">
                                        <div className="font-medium text-slate-800">{h.chemicalName}</div>
                                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">CAS: {casNo}</span>
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{chemType}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 font-bold text-blue-600">{h.amount}{h.unit}</td>
                                    <td className="p-3 text-slate-500">{h.manufacturer}</td>
                                    <td className="p-3 text-center">
                                      {h.signature
                                        ? <button onClick={() => setSignatureViewModal(h.signature)} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded text-xs hover:bg-green-100 transition" title="서명 확인">✍️ 보기</button>
                                        : <span className="text-slate-300 text-xs">없음</span>
                                      }
                                    </td>
                                    {currentUser === 'admin' && (
                                      <td className="p-3 text-center">
                                        <button onClick={() => setEditHistoryItem({...h})}
                                          className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded text-xs hover:bg-amber-100 transition">
                                          ✏️ 수정
                                        </button>
                                      </td>
                                    )}
                                </tr>
                            );
                        })}
                        {filteredHistory.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">기록이 없습니다.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>

        {/* 서명 확인 모달 */}
        {signatureViewModal && (
          <div className="fixed inset-0 bg-black/70 z-[120] flex items-center justify-center p-4" onClick={() => setSignatureViewModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-3 text-slate-800 flex items-center gap-2">✍️ 서명 확인</h3>
              <div className="border rounded-xl overflow-hidden bg-slate-50">
                <img src={signatureViewModal} alt="서명" className="w-full object-contain" style={{maxHeight:'200px'}} />
              </div>
              <button onClick={() => setSignatureViewModal(null)} className="mt-4 w-full py-2.5 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 transition">닫기</button>
            </div>
          </div>
        )}

        {/* 기록 수정 모달 (관리자 전용) */}
        {editHistoryItem && (
          <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4" onClick={() => setEditHistoryItem(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">✏️ 반출입 기록 수정
                <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 ml-1">관리자 전용</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">처리일자</label>
                  <input type="date" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.actionDate||''} onChange={e=>setEditHistoryItem({...editHistoryItem, actionDate: e.target.value})}/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">구분</label>
                  <select className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.type} onChange={e=>setEditHistoryItem({...editHistoryItem, type: e.target.value})}>
                    <option value="IN">반입</option><option value="OUT">반출</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">저장소</label>
                  <input type="text" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.storage||''} onChange={e=>setEditHistoryItem({...editHistoryItem, storage: e.target.value})}/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">실험실</label>
                  <input type="text" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.labName||''} onChange={e=>setEditHistoryItem({...editHistoryItem, labName: e.target.value})}/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">선반</label>
                  <input type="text" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.shelf||''} onChange={e=>setEditHistoryItem({...editHistoryItem, shelf: e.target.value})} placeholder="미지정"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">신청자</label>
                  <input type="text" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.requestorName||''} onChange={e=>setEditHistoryItem({...editHistoryItem, requestorName: e.target.value})}/>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-xs font-bold text-slate-500">물질명</label>
                  <input type="text" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.chemicalName||''} onChange={e=>setEditHistoryItem({...editHistoryItem, chemicalName: e.target.value})}/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">수량</label>
                  <input type="number" className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.amount||''} onChange={e=>setEditHistoryItem({...editHistoryItem, amount: e.target.value})}/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">단위</label>
                  <select className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.unit||'L'} onChange={e=>setEditHistoryItem({...editHistoryItem, unit: e.target.value})}>
                    {['L','kg','mL','g','Can','Bottle'].map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-xs font-bold text-slate-500">제조사</label>
                  <select className="border p-2 rounded focus:ring-2 focus:ring-amber-400" value={editHistoryItem.manufacturer||''} onChange={e=>setEditHistoryItem({...editHistoryItem, manufacturer: e.target.value})}>
                    <option value="">선택</option>
                    {[...manufacturers].sort((a,b)=>a.name.localeCompare(b.name,'ko')).map((m,i)=><option key={i} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 p-2 rounded border border-amber-100">⚠️ 수정 시 실제 재고(inventory)에는 반영되지 않으며, 기록만 변경됩니다.</p>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setEditHistoryItem(null)} className="flex-1 py-2.5 border rounded-lg font-bold text-slate-600 hover:bg-slate-50">취소</button>
                <button onClick={() => saveEditedHistory(editHistoryItem)} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold">저장</button>
              </div>
            </div>
          </div>
        )}
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
                          {[...manufacturers].sort((a,b) => { const na = typeof a === "object" ? a.name : a; const nb = typeof b === "object" ? b.name : b; return na.localeCompare(nb,"ko"); }).map((m, i) => {
                              const name = typeof m === 'object' ? m.name : m;
                              const id = typeof m === 'object' ? m.id : name; 
                              return (
                                <span key={i} className="group relative bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 hover:bg-blue-100 pr-8 transition">
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
                                for (const parts of rows) {
                                  const name = String(parts[0] || '').trim();
                                  if (!name || manufacturers.some(m => m.name === name)) continue;
                                  if (isDemoMode) { setManufacturers(prev => [...prev, { id: String(Date.now() + count), name }]); }
                                  else { try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'manufacturers'), { name }); } catch(err) {} }
                                  count++;
                                }
                                showAlert("완료", `제조사 ${count}건 업로드 완료`);
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
      {renderBulkImportModal()}{/* ✅ 로그인 후에도 엑셀 모달이 표시되도록 최상위에 배치 */}
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
                    {activeTab === 'safety_status' && renderSafetyStatusScreen()}
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
