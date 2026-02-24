import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bell, Phone, User, Stethoscope, X, MapPin, Edit2, Search, Clock, ArrowUpRight, ArrowDownLeft, Check, PhoneMissed, Trash2, Users, UserCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type UserData = {
  id: string;
  name: string;
  designation: string;
  roomNumber: string;
  isOnline: boolean;
};

type CallRecord = {
  id: string;
  type: 'incoming' | 'outgoing';
  status: 'missed' | 'answered' | 'completed';
  timestamp: Date;
  otherParty: {
    name: string;
    designation: string;
    roomNumber: string;
  };
};

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('Doctor');
  const [roomNumber, setRoomNumber] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [missedCalls, setMissedCalls] = useState(0);
  const [activeTab, setActiveTab] = useState<'staff' | 'history' | 'profile'>('staff');
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [incomingCall, setIncomingCall] = useState<{ callerName: string; callerDesignation: string; callerRoomNumber: string } | null>(null);
  const [callingUser, setCallingUser] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const registrationRef = useRef({ registered, name, designation, roomNumber, isOnline });

  // Keep ref in sync with state
  useEffect(() => {
    registrationRef.current = { registered, name, designation, roomNumber, isOnline };
  }, [registered, name, designation, roomNumber, isOnline]);

  useEffect(() => {
    // Initialize audio
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.loop = true;

    const newSocket = io({
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server with ID:', newSocket.id);
      setIsConnected(true);
      // Re-register if already registered before disconnect
      const { registered: isReg, name: n, designation: d, roomNumber: r, isOnline: o } = registrationRef.current;
      if (isReg && n && r) {
        newSocket.emit('register', { name: n, designation: d, roomNumber: r, isOnline: o });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setIsConnected(false);
    });

    newSocket.on('users_update', (updatedUsers: UserData[]) => {
      console.log('Users updated:', updatedUsers);
      setUsers(updatedUsers.filter(u => u.id !== newSocket.id));
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    newSocket.on('incoming_call', (data: { callerName: string; callerDesignation: string; callerRoomNumber: string }) => {
      setIncomingCall(data);
      
      // Add to call history as pending/incoming
      const newCall: CallRecord = {
        id: Date.now().toString(),
        type: 'incoming',
        status: 'missed', // Default to missed, update if answered
        timestamp: new Date(),
        otherParty: {
          name: data.callerName,
          designation: data.callerDesignation,
          roomNumber: data.callerRoomNumber
        }
      };
      setCallHistory(prev => [newCall, ...prev]);

      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      }
      
      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate([500, 250, 500, 250, 500, 250, 500]);
      }
    });

    return () => {
      newSocket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && roomNumber.trim() && socket) {
      socket.emit('register', { name, designation, roomNumber, isOnline });
      setRegistered(true);
    }
  };

  const toggleStatus = () => {
    if (socket) {
      const newStatus = !isOnline;
      setIsOnline(newStatus);
      socket.emit('update_status', { isOnline: newStatus });
    }
  };

  const handleCall = (targetId: string) => {
    if (socket) {
      const targetUser = users.find(u => u.id === targetId);
      if (targetUser) {
        // Add to call history
        const newCall: CallRecord = {
          id: Date.now().toString(),
          type: 'outgoing',
          status: 'completed',
          timestamp: new Date(),
          otherParty: {
            name: targetUser.name,
            designation: targetUser.designation,
            roomNumber: targetUser.roomNumber
          }
        };
        setCallHistory(prev => [newCall, ...prev]);
      }

      socket.emit('call_user', { targetId, callerName: name, callerDesignation: designation, callerRoomNumber: roomNumber });
      setCallingUser(targetId);
      setTimeout(() => setCallingUser(null), 3000); // Reset after 3 seconds
    }
  };

  const dismissCall = () => {
    setIncomingCall(null);
    setMissedCalls(prev => prev + 1);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  };

  const acknowledgeCall = () => {
    setIncomingCall(null);
    
    // Update the most recent incoming call status to answered
    setCallHistory(prev => {
      const newHistory = [...prev];
      const lastIncomingIndex = newHistory.findIndex(call => call.type === 'incoming');
      if (lastIncomingIndex !== -1) {
        newHistory[lastIncomingIndex] = { ...newHistory[lastIncomingIndex], status: 'answered' };
      }
      return newHistory;
    });

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(user => 
      user.name.toLowerCase().includes(query) || 
      user.designation.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!registered) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md"
        >
          <div className="flex justify-center mb-8">
            <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col items-center justify-center text-center shadow-sm aspect-square w-48">
              <span className="text-3xl font-black text-[#007a9f] tracking-tight mb-1">APOLLO</span>
              <span className="text-sm font-bold text-slate-500 tracking-[0.25em] mb-3">CLINICS</span>
              <span className="text-[10px] font-semibold text-slate-400 tracking-widest uppercase">Rajamundhry</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Staff Pager System</h1>
          <p className="text-center text-slate-500 mb-8">Enter your details to join the network</p>
          
          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="e.g. Dr. Sarah Smith"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Designation</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Stethoscope className="h-5 w-5 text-slate-400" />
                </div>
                <select
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none bg-white"
                >
                  <option value="Doctor">Doctor</option>
                  <option value="Nurse">Nurse</option>
                  <option value="Head Nurse">Head Nurse</option>
                  <option value="Attendant">Attendant</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Room / Cabin Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="e.g. Room 101, Cabin A"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium text-lg shadow-md"
            >
              {registered === false && name ? 'Update Details' : 'Join Network'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white border border-slate-200 p-2 rounded-lg flex flex-col items-center justify-center text-center shadow-sm aspect-square w-16">
              <span className="text-[10px] font-black text-[#007a9f] tracking-tight">APOLLO</span>
              <span className="text-[5px] font-bold text-slate-500 tracking-[0.2em] mt-0.5">CLINICS</span>
              <span className="text-[4px] font-semibold text-slate-400 tracking-widest uppercase mt-1">Rajamundhry</span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{users.length} staff online</p>
              <div className="flex items-center mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                  {isConnected ? 'Connected' : 'Reconnecting...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 flex flex-col pb-24">
        {activeTab === 'profile' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 mt-2">
              <h2 className="text-xl font-bold text-slate-800">My Profile</h2>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6 relative overflow-hidden">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold shadow-inner
                    ${designation === 'Doctor' ? 'bg-indigo-100 text-indigo-700' : 
                      designation.includes('Nurse') ? 'bg-emerald-100 text-emerald-700' : 
                      'bg-slate-100 text-slate-700'}`}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className={`absolute bottom-1 right-1 w-6 h-6 border-4 border-white rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                </div>
                
                <div>
                  <h3 className="font-bold text-slate-800 text-2xl">{name}</h3>
                  <p className="text-slate-500 font-medium mt-1">{designation} • {roomNumber}</p>
                </div>

                <div className="w-full h-px bg-slate-100 my-4"></div>

                <div className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 rounded-2xl">
                  <span className="font-semibold text-slate-700">Status</span>
                  <button
                    onClick={toggleStatus}
                    className={`relative inline-flex h-8 w-20 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 overflow-hidden ${
                      isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute inset-y-0 left-0 flex items-center justify-center w-1/2 text-[10px] font-bold text-white transition-opacity duration-200 ${
                        isOnline ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      ON
                    </span>
                    <span
                      className={`absolute inset-y-0 right-0 flex items-center justify-center w-1/2 text-[10px] font-bold text-slate-600 transition-opacity duration-200 ${
                        isOnline ? 'opacity-0' : 'opacity-100'
                      }`}
                    >
                      OFF
                    </span>
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm z-10 ${
                        isOnline ? 'translate-x-[3.25rem]' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <button 
                  onClick={() => setRegistered(false)}
                  className="w-full mt-2 py-3.5 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center space-x-2"
                >
                  <Edit2 size={18} />
                  <span>Edit Profile Details</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <h2 className="text-xl font-bold text-slate-800">Available Staff</h2>
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white shadow-sm placeholder-slate-400"
                  placeholder="Search by name or role..."
                />
              </div>
            </div>
            
            {users.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4 py-12">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                  <User size={32} className="opacity-40" />
                </div>
                <p className="font-medium">No other staff members are currently online.</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4 py-12">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                  <Search size={32} className="opacity-40" />
                </div>
                <p className="font-medium">No staff members found matching "{searchQuery}".</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredUsers.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold
                          ${user.designation === 'Doctor' ? 'bg-indigo-100 text-indigo-700' : 
                            user.designation.includes('Nurse') ? 'bg-emerald-100 text-emerald-700' : 
                            'bg-slate-100 text-slate-700'}`}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-white rounded-full ${user.isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg">{user.name}</h3>
                        <p className="text-sm font-medium text-slate-500">{user.designation} • {user.roomNumber}</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleCall(user.id)}
                      disabled={callingUser === user.id || !user.isOnline}
                      className={`flex items-center justify-center w-12 h-12 sm:w-auto sm:px-6 sm:py-3 rounded-2xl font-bold transition-all
                        ${!user.isOnline 
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : callingUser === user.id 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md hover:shadow-lg'}`}
                    >
                      <Bell size={20} className={callingUser === user.id ? 'animate-bounce' : 'sm:mr-2'} />
                      <span className="hidden sm:inline">{callingUser === user.id ? 'Calling...' : 'Page Staff'}</span>
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center">
                <Clock size={20} className="mr-2 text-blue-600" />
                Call History
              </h2>
              {callHistory.length > 0 && (
                <button
                  onClick={() => setCallHistory([])}
                  className="flex items-center space-x-1.5 text-sm font-bold text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={16} />
                  <span>Clear All</span>
                </button>
              )}
            </div>
            
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              {callHistory.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Phone size={32} className="opacity-30" />
                  </div>
                  <p className="font-medium text-lg text-slate-500">No calls yet</p>
                  <p className="text-sm mt-1">Your call history will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {callHistory.map((call) => (
                    <div key={call.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className={`p-3 rounded-full shadow-sm ${
                          call.type === 'incoming' 
                            ? call.status === 'missed' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                            : 'bg-blue-50 text-blue-600'
                        }`}>
                          {call.type === 'incoming' ? (
                            call.status === 'missed' ? <PhoneMissed size={20} /> : <ArrowDownLeft size={20} />
                          ) : (
                            <ArrowUpRight size={20} />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-lg">{call.otherParty.name}</h4>
                          <p className="text-sm font-medium text-slate-500">{call.otherParty.designation} • {call.otherParty.roomNumber}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-800 font-bold">{formatTime(call.timestamp)}</p>
                        <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${
                          call.status === 'missed' ? 'text-red-500' : 
                          call.status === 'answered' ? 'text-emerald-500' : 
                          'text-slate-400'
                        }`}>
                          {call.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-40">
        <div className="max-w-3xl mx-auto flex justify-around items-center px-2 py-2">
          <button 
            onClick={() => setActiveTab('staff')}
            className={`flex flex-col items-center justify-center w-20 py-2 rounded-2xl transition-colors ${activeTab === 'staff' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <Users size={24} className={activeTab === 'staff' ? 'fill-blue-50' : ''} />
            <span className="text-[10px] font-bold mt-1">Staff</span>
          </button>
          
          <button 
            onClick={() => {
              setActiveTab('history');
              setMissedCalls(0);
            }}
            className={`flex flex-col items-center justify-center w-20 py-2 rounded-2xl transition-colors relative ${activeTab === 'history' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <div className="relative">
              <Clock size={24} className={activeTab === 'history' ? 'fill-blue-50' : ''} />
              {missedCalls > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                  {missedCalls}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold mt-1">History</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center w-20 py-2 rounded-2xl transition-colors ${activeTab === 'profile' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <UserCircle size={24} className={activeTab === 'profile' ? 'fill-blue-50' : ''} />
            <span className="text-[10px] font-bold mt-1">Profile</span>
          </button>
        </div>
      </nav>

      {/* Incoming Call Modal */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="bg-red-500 p-6 text-center relative overflow-hidden">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }} 
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-red-400 opacity-50 rounded-full blur-3xl"
                />
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Phone size={32} className="text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-white text-xl font-medium opacity-90 mb-1">Incoming Call From</h2>
                  <h3 className="text-white text-3xl font-bold">{incomingCall.callerName}</h3>
                  <p className="text-red-100 mt-2 font-medium">{incomingCall.callerDesignation} • {incomingCall.callerRoomNumber}</p>
                </div>
              </div>
              
              <div className="p-6">
                <p className="text-center text-slate-600 mb-6 font-medium">
                  Please report to {incomingCall.callerName} at {incomingCall.callerRoomNumber} immediately.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={acknowledgeCall}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold text-lg transition-colors flex items-center justify-center space-x-2 shadow-md"
                  >
                    <span>Acknowledge</span>
                  </button>
                  <button
                    onClick={dismissCall}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-2xl font-semibold transition-colors flex items-center justify-center space-x-2"
                  >
                    <X size={20} />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
