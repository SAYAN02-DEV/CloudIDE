"use client";
import React, { useState, useEffect } from 'react';
import { Code, Search, Star, User, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

const Navbar = () => {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    
    if (token && storedUsername) {
      setIsLoggedIn(true);
      setUsername(storedUsername);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    setUsername('');
    router.push('/');
  };

  const handleLogin = () => {
    router.push('/login');
  };

  const handleSignup = () => {
    router.push('/signup');
  };

  return (
    <nav className='flex w-full items-center justify-between px-6 py-3 bg-[#1a1a1a] border-b border-gray-800'>
      <div className='flex items-center gap-2 text-white cursor-pointer' onClick={() => router.push('/')}>
        <Code className='w-6 h-6 text-blue-500' />
        <span className='text-xl font-semibold'>CloudIDE</span>
      </div>
      
      {isLoggedIn && (
        <div className='flex-1 max-w-md mx-8'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
            <input 
              className="w-full bg-[#2a2a2a] text-white rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500" 
              type="text" 
              placeholder='Search projects (Cmd+K)'
            />
            <span className='absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500'>⌘K</span>
          </div>
        </div>
      )}

      <div className='flex items-center gap-4'>
        {isLoggedIn ? (
          <>
            <button className='flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white transition-colors'>
              <Star className='w-4 h-4' />
              <span className='text-sm'>Star</span>
            </button>
            <div className='relative group'>
              <button className='flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] text-white rounded-full hover:bg-[#3a3a3a] transition-colors'>
                <User className='w-5 h-5' />
                <span className='text-sm font-medium'>{username.substring(0, 2).toUpperCase()}</span>
              </button>
              <div className='absolute right-0 mt-2 w-48 bg-[#2a2a2a] border border-gray-700 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all'>
                <div className='p-3 border-b border-gray-700'>
                  <p className='text-white text-sm font-medium'>{username}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className='w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white hover:bg-[#3a3a3a] transition-colors text-sm'
                >
                  <LogOut className='w-4 h-4' />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <button 
              onClick={handleLogin}
              className='px-4 py-2 text-gray-300 hover:text-white transition-colors text-sm font-medium'
            >
              Login
            </button>
            <button 
              onClick={handleSignup}
              className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium'
            >
              Sign Up
            </button>
          </>
        )}
      </div>
    </nav>
  )
}

export default Navbar;
