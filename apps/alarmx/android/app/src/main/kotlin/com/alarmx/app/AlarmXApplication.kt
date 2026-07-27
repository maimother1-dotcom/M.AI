package com.alarmx.app

import android.app.Application
import com.alarmx.app.data.AlarmXDatabase
import com.alarmx.app.data.PanchangCache

class AlarmXApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AlarmXDatabase.get(this)
        PanchangCache.get(this)
        // PRD 18.5: the debug menu is compiled out of release, not hidden.
        if (BuildConfig.DEBUG_MENU) DebugMenu.install(this)
    }
}
