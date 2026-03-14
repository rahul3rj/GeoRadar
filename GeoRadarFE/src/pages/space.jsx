import React from 'react'
import Globe from '../components/Globe'
import SpaceLayer from '../components/SpaceLayer'

const Space = () => {
    return (
        <div className='h-screen w-full bg-zinc-900 overflow-hidden'>
            <div className='flex items-center justify-center h-full'>
                <div className='h-[100vh] w-full'>
                    <Globe>
                        <SpaceLayer />
                    </Globe>
                </div>
            </div>
        </div>
    )
}

export default Space