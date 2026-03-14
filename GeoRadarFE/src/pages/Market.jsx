import React from 'react'
import Globe from '../components/Globe'

const Market = () => {
    return (
        <div className='h-screen w-full bg-zinc-900 overflow-hidden'>
            <div className='flex items-center justify-center h-full'>
                <div className='h-[100vh] w-full'>
                    <Globe />
                </div>
            </div>
        </div>
    )
}

export default Market