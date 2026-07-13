'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';
import {
  clearStoredSession,
  getStoredSession,
  revokeSessionOnBackend,
  saveStoredSession,
  validateSessionWithBackend,
  SESSION_KEEP_ALIVE_MS,
} from '@/lib/session';

interface UserInfo {
  sessionId: string;
  email: string;
  name: string;
  picture: string;
}

interface MediaFile {
  id: number;
  fileName: string;
  mediaItemId: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
  productUrl: string | null;
  createdAt: string;
}

interface AppModal {
  open: boolean;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface UploadJob {
  id: string;
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

function AppModalDialog({
  modal,
  onClose,
}: {
  modal: AppModal;
  onClose: () => void;
}) {
  if (!modal.open) return null;

  const styles = {
    success: {
      icon: <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
      button: 'bg-green-600 hover:bg-green-700',
      border: 'border-green-100',
    },
    error: {
      icon: <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
      button: 'bg-red-600 hover:bg-red-700',
      border: 'border-red-100',
    },
    info: {
      icon: <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      button: 'bg-blue-600 hover:bg-blue-700',
      border: 'border-blue-100',
    },
  }[modal.type];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-white shadow-2xl border ${styles.border}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{styles.icon}</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{modal.title}</h3>
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap leading-6">
                {modal.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className={`${styles.button} text-white px-5 py-2 rounded-full text-sm font-medium transition-colors`}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotosApp() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [myFiles, setMyFiles] = useState<MediaFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploadManagerOpen, setUploadManagerOpen] = useState(false);
  const [modal, setModal] = useState<AppModal>({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showModal = (type: AppModal['type'], title: string, message: string) => {
    setModal({ open: true, type, title, message });
  };

  const closeModal = () => {
    setModal((prev) => ({ ...prev, open: false }));
  };

  const handleLogin = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    window.location.href = `${apiUrl}/auth/google`;
  };

  const handleLogout = async () => {
    if (user?.sessionId) {
      await revokeSessionOnBackend(user.sessionId);
    }
    clearStoredSession();
    setUser(null);
    setMyFiles([]);
  };

  const handleSessionExpired = async (message?: string) => {
    await handleLogout();
    showModal(
      'error',
      'Phiên đăng nhập hết hạn',
      message || 'Token Google đã hết hạn. Vui lòng đăng nhập lại.',
    );
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      const login = searchParams.get('login');
      const sessionIdFromUrl = searchParams.get('sessionId');
      const tokenFromUrl = searchParams.get('token');

      if (login === 'success' && sessionIdFromUrl) {
        const newUser = {
          sessionId: sessionIdFromUrl,
          email: searchParams.get('email') || '',
          name: searchParams.get('name') || '',
          picture: searchParams.get('picture') || '',
        };
        saveStoredSession(newUser);
        if (!cancelled) setUser(newUser);
        window.history.replaceState({}, document.title, window.location.pathname);
        if (!cancelled) setSessionChecking(false);
        return;
      }

      if (login === 'success' && tokenFromUrl) {
        clearStoredSession();
        if (!cancelled) setSessionChecking(false);
        showModal('info', 'Cần đăng nhập lại', 'Phiên đăng nhập đã được cập nhật. Vui lòng đăng nhập Google một lần nữa.');
        return;
      }

      const stored = getStoredSession();
      if (!stored) {
        if (!cancelled) setSessionChecking(false);
        return;
      }

      const validated = await validateSessionWithBackend(stored.sessionId);
      if (cancelled) return;

      if (!validated) {
        clearStoredSession();
        setUser(null);
        showModal(
          'info',
          'Phiên hết hạn',
          'Không thể gia hạn phiên Google. Vui lòng đăng nhập lại.',
        );
      } else {
        saveStoredSession(validated);
        setUser(validated);
      }

      setSessionChecking(false);
    };

    bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      fetchMyFiles(true);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const socket = io(apiUrl);
      
      socket.on('filesUpdated', (data) => {
        if (data && data.email === user.email) {
          fetchMyFiles(false);
        }
      });
      
      return () => {
        socket.disconnect();
      };
    }
  }, [user]);

  useEffect(() => {
    if (!user?.sessionId) return;

    const refreshSession = async () => {
      if (document.hidden) return;

      const validated = await validateSessionWithBackend(user.sessionId);
      if (!validated) {
        await handleSessionExpired(
          'Phiên Google đã hết hạn trong lúc bạn không dùng web. Vui lòng đăng nhập lại.',
        );
      }
    };

    const interval = setInterval(refreshSession, SESSION_KEEP_ALIVE_MS);
    window.addEventListener('focus', refreshSession);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshSession);
    };
  }, [user?.sessionId]);



  const fetchMyFiles = async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoadingFiles(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const params = new URLSearchParams({
        sessionId: user.sessionId,
      });
      const res = await fetch(`${apiUrl}/upload/my-files?${params.toString()}`);
      if (res.status === 401) {
        await handleSessionExpired();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMyFiles(data);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      if (showLoading) setLoadingFiles(false);
    }
  };



  const uploadFiles = async (files: FileList | File[]) => {
    if (!user || files.length === 0) return;
    setUploading(true);

    const fileList = Array.from(files);
    
    // Initialize jobs
    const newJobs: UploadJob[] = fileList.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      status: 'pending',
    }));
    setUploadJobs(newJobs);
    setUploadManagerOpen(true);

    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList[i];
      const jobId = newJobs[i].id;
      
      // Mark as uploading
      setUploadJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'uploading' } : j)));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', user.sessionId);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
        const res = await fetch(`${apiUrl}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (res.status === 401) {
          await handleSessionExpired();
          return;
        }

        if (!res.ok) {
          const errorData = await res.json();
          setUploadJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error: errorData.message } : j)));
          continue;
        }

        setUploadJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'success' } : j)));
      } catch (err: any) {
        console.error('Upload error', err);
        setUploadJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error: err.message } : j)));
      }
    }

    fetchMyFiles();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  if (sessionChecking) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans text-gray-500">
        <svg className="w-10 h-10 mb-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-sm">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans">
        <svg className="w-20 h-20 mb-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
        <h1 className="text-4xl font-normal text-gray-800 mb-2 tracking-tight">Google Photos</h1>
        <p className="text-gray-500 mb-8 text-lg">Upload và xem ảnh trên Google Photos của bạn.</p>
        <button
          onClick={handleLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-medium transition-colors shadow-sm"
        >
          Đăng nhập Google Photos
        </button>
      </div>
    );
  }

  return (
    <>
      <AppModalDialog modal={modal} onClose={closeModal} />

      {previewFile && (
        <div
          className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewFile(null)}
        >
          <button
            onClick={() => setPreviewFile(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-2"
            title="Đóng"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="max-w-6xl max-h-[90vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {previewFile.fullUrl || previewFile.thumbnailUrl ? (
              <img
                src={previewFile.fullUrl || previewFile.thumbnailUrl!}
                alt={previewFile.fileName}
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-white text-center py-20">Không tải được ảnh</div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-white">
              <span className="text-sm text-white/80">{previewFile.fileName}</span>
              {previewFile.productUrl && (
                <a
                  href={previewFile.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full"
                >
                  Mở trên Google Photos
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex h-screen bg-white text-gray-800 font-sans" onDragEnter={handleDrag}>

        <aside className="w-64 flex-shrink-0 border-r border-gray-100 flex flex-col hidden md:flex">
          <div className="h-16 flex items-center px-6 gap-2">
            <svg className="w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            <span className="text-xl font-normal text-gray-600 tracking-tight">Photos</span>
          </div>
          <nav className="flex-1 pt-4 pr-4">
            <div className="bg-[#e8f0fe] text-blue-700 font-medium px-6 py-3 rounded-r-full cursor-pointer flex items-center gap-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              My Photos
            </div>
          </nav>
        </aside>

        <main className="flex-1 flex flex-col relative h-full">

          <header className="h-16 flex items-center justify-between px-6">
            <div className="flex-1 max-w-2xl hidden md:block">
              <div className="bg-gray-100/80 rounded-lg px-4 py-3 flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <span className="text-gray-500 font-medium">Ảnh đã upload qua ứng dụng</span>
              </div>
            </div>

              <div className="flex flex-1 justify-end items-center gap-4">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
                    uploading
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-[#e8f0fe] hover:bg-[#d2e3fc] text-blue-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload
                </button>

              <div className="w-px h-8 bg-gray-200 mx-2"></div>

              <div className="relative group cursor-pointer">
                <img src={user.picture} alt="Avatar" className="w-9 h-9 rounded-full border border-gray-200" referrerPolicy="no-referrer" />
                <div className="absolute right-0 top-full pt-2 hidden group-hover:block z-50 w-64">
                  <div className="bg-white shadow-lg border border-gray-100 rounded-xl p-4">
                    <p className="font-medium text-gray-800">{user.name}</p>
                    <p className="text-sm text-gray-500 mb-4">{user.email}</p>
                    <button onClick={handleLogout} className="w-full text-center py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700">Sign out</button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div
            className="flex-1 overflow-y-auto px-6 pb-6 relative"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            {dragActive && (
              <div className="absolute inset-0 z-40 bg-blue-500/10 backdrop-blur-[2px] border-4 border-blue-400 border-dashed m-4 rounded-2xl flex items-center justify-center">
                <div className="bg-white px-8 py-4 rounded-full shadow-lg flex items-center gap-3 text-blue-600 font-semibold text-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  Thả ảnh vào đây
                </div>
              </div>
            )}

            {loadingFiles ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
                <svg className="w-10 h-10 mb-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-gray-500">Đang tải ảnh từ Google Photos...</p>
              </div>
            ) : myFiles.length > 0 ? (
              <>
                <div className="flex items-center justify-between mt-6 mb-4">
                  <h2 className="text-lg font-medium text-gray-800">
                    Ảnh của bạn <span className="text-gray-400 font-normal">({myFiles.length})</span>
                  </h2>
                  <div className="flex gap-2">

                    <button
                      onClick={() => fetchMyFiles(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
                    >
                      Làm mới
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
                  {myFiles.map(file => (
                    <div
                      key={file.id}
                      className="relative aspect-square group rounded-xl overflow-hidden bg-gray-100 shadow-sm border border-gray-200 cursor-pointer"
                      onClick={() => setPreviewFile(file)}
                    >
                      {file.thumbnailUrl ? (
                        <img
                          src={file.thumbnailUrl}
                          alt={file.fileName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                          onError={() => fetchMyFiles(false)}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-2 text-center">
                          <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-[10px] leading-tight font-medium text-red-500">Lỗi tải ảnh<br />(Thiếu quyền đọc)</span>
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                      <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs truncate max-w-[120px]" title={file.fileName}>{file.fileName}</span>
                      </div>

                      <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10">
                        {file.thumbnailUrl && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(file.thumbnailUrl!);
                              showModal('success', 'Đã copy', 'Link ảnh đã được copy vào clipboard.');
                            }}
                            className="bg-black/40 hover:bg-blue-500/80 text-white p-1.5 rounded-full cursor-pointer border border-white/20 hover:border-blue-400"
                            title="Copy link ảnh"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                          </div>
                        )}

                        {file.productUrl && (
                          <a
                            href={file.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="bg-black/40 hover:bg-green-500/80 text-white p-1.5 rounded-full cursor-pointer border border-white/20 hover:border-green-400"
                            title="Mở trên Google Photos"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        )}
                      </div>

                      <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-md shadow-sm border bg-black/40 text-white border-white/20">
                        {new Date(file.createdAt).toLocaleTimeString('vi-VN')}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
                <svg className="w-24 h-24 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-lg font-medium text-gray-500">Chưa có ảnh nào</p>
                <p className="text-sm">Kéo thả ảnh vào đây để upload lên Google Photos</p>
              </div>
            )}
          </div>
        </main>
      </div>



      {/* Google Photos Style Upload Manager */}
      {uploadManagerOpen && uploadJobs.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden flex flex-col transition-all duration-300">
          <div className="bg-gray-800 px-4 py-3 flex items-center justify-between text-white">
            <h3 className="text-sm font-medium">
              {uploadJobs.some(j => j.status === 'uploading' || j.status === 'pending')
                ? `Đang tải lên ${uploadJobs.filter(j => j.status === 'success').length}/${uploadJobs.length} mục...`
                : uploadJobs.some(j => j.status === 'error')
                  ? `Đã tải lên xong (có lỗi)`
                  : `Đã tải lên ${uploadJobs.length} mục`}
            </h3>
            <button 
              onClick={() => setUploadManagerOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 bg-gray-50/50">
            {uploadJobs.map(job => (
              <div key={job.id} className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-md transition-colors">
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                  {job.status === 'pending' && <svg className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>}
                  {job.status === 'uploading' && (
                    <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {job.status === 'success' && <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {job.status === 'error' && <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate font-medium">{job.name}</p>
                  {job.error && <p className="text-xs text-red-500 truncate mt-0.5">{job.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <AppModalDialog modal={modal} onClose={closeModal} />
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center text-blue-500 font-medium">Loading...</div>}>
      <PhotosApp />
    </Suspense>
  );
}
