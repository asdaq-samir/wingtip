package app.wingtipmaps.android.about

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.BuildConfig
import app.wingtipmaps.android.engine.CyclePacks
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * About's state: the build, and the cycle of the packs the phone keeps for
 * the air (CyclePacks' index, read from its file off the main thread).
 * Null where the phone has kept none yet: About shows only what is so,
 * never a cycle the phone does not have. The chart's edition is the
 * map's own (Charts), read by the screen.
 */
@HiltViewModel
class AboutModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    val version: String = BuildConfig.VERSION_NAME
    val build: Int = BuildConfig.VERSION_CODE

    private val _packsCycle = MutableStateFlow<String?>(null)
    val packsCycle: StateFlow<String?> = _packsCycle.asStateFlow()

    init {
        viewModelScope.launch {
            _packsCycle.value = withContext(Dispatchers.IO) { CyclePacks.of(getApplication<Application>()).index?.cycle }
        }
    }
}
