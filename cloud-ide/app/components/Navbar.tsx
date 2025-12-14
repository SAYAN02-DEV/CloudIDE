"use client";
import React from 'react';
import { Code, Search, Star, User } from 'lucide-react';

const Navbar = () => {
  return (
    <nav className='flex w-full items-center justify-between px-6 py-3 bg-[#1a1a1a] border-b border-gray-800'>
      <div className='flex items-center gap-2 text-white'>
        <Code className='w-6 h-6 text-blue-500' />
        <span className='text-xl font-semibold'>CloudIDE</span>
      </div>
      
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

      <div className='flex items-center gap-4'>
        <button className='flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white transition-colors'>
          <Star className='w-4 h-4' />
          <span className='text-sm'>Star</span>
        </button>
        <button className='flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] text-white rounded-full hover:bg-[#3a3a3a] transition-colors'>
          <User className='w-5 h-5' />
          <span className='text-sm font-medium'>JD</span>
        </button>
      </div>
    </nav>
  )
}

export default Navbar;
