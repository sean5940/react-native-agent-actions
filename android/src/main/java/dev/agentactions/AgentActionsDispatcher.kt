package dev.agentactions

import android.content.Context
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import java.util.UUID
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AgentActionsTimeoutException(action: String, timeoutMs: Long) :
  Exception("The JavaScript handler for \"$action\" did not respond within $timeoutMs ms.")

class AgentActionsRejectedException(message: String) : Exception(message)

/**
 * Routes calls that the OS makes into the app (AppFunctions) to the JavaScript handlers and waits for their result.
 *
 * Each call runs as a Headless JS task. React Native pauses JavaScript timers while no Activity is in the
 * foreground unless a headless task is active, so a plain callback would leave `setTimeout` frozen inside handlers.
 *
 * Calls can arrive while the process has just been started for the call and React Native has not loaded the bundle.
 * Those calls are queued, React Native is started without an Activity, and the queue is delivered once JavaScript
 * signals that its handlers are registered.
 */
object AgentActionsDispatcher {
  private const val TAG = "AgentActions"
  private const val TASK_KEY = "AgentActionsRequest"
  const val DEFAULT_TIMEOUT_MS = 10_000L

  private class Request(val id: String, val action: String, val payloadJson: String, val timeoutMs: Long)

  private val lock = Any()
  private var ready = false
  private var applicationContext: Context? = null
  private val waiting = HashMap<String, CancellableContinuation<String>>()
  private val queued = ArrayList<Request>()

  @JvmStatic
  suspend fun dispatch(
    context: Context,
    action: String,
    payloadJson: String,
    timeoutMs: Long = DEFAULT_TIMEOUT_MS,
  ): String =
    try {
      withTimeout(timeoutMs) {
        suspendCancellableCoroutine { continuation ->
          val request = Request(UUID.randomUUID().toString(), action, payloadJson, timeoutMs)
          val isReady: Boolean
          synchronized(lock) {
            applicationContext = context.applicationContext
            waiting[request.id] = continuation
            isReady = ready
            if (!isReady) {
              queued.add(request)
            }
          }
          continuation.invokeOnCancellation { take(request.id) }

          Log.i(TAG, "dispatch $action id=${request.id} javaScriptReady=$isReady")
          if (isReady) {
            deliver(request)
          } else {
            startReactNative(context)
          }
        }
      }
    } catch (error: TimeoutCancellationException) {
      throw AgentActionsTimeoutException(action, timeoutMs)
    }

  /** Called when JavaScript has registered its handlers. The listener itself is only used on iOS. */
  fun setListener(@Suppress("UNUSED_PARAMETER") listener: (String, String, String) -> Unit) {
    val pending: List<Request>
    synchronized(lock) {
      ready = true
      pending = ArrayList(queued)
      queued.clear()
    }
    Log.i(TAG, "JavaScript ready, delivering ${pending.size} queued request(s)")
    pending.forEach(::deliver)
  }

  fun resolve(requestId: String, resultJson: String) {
    take(requestId)?.resume(resultJson)
  }

  fun reject(requestId: String, message: String) {
    take(requestId)?.resumeWithException(AgentActionsRejectedException(message))
  }

  private fun take(requestId: String): CancellableContinuation<String>? =
    synchronized(lock) {
      queued.removeAll { it.id == requestId }
      waiting.remove(requestId)
    }

  private fun deliver(request: Request) {
    UiThreadUtil.runOnUiThread {
      val context = synchronized(lock) { applicationContext }
      val reactContext = (context as? ReactApplication)?.reactHost?.currentReactContext
      if (reactContext == null || !reactContext.hasActiveReactInstance()) {
        // React Native was torn down after JavaScript signalled readiness. Queue again and restart it.
        synchronized(lock) {
          ready = false
          if (waiting.containsKey(request.id)) {
            queued.add(request)
          }
        }
        context?.let(::startReactNative)
        return@runOnUiThread
      }
      val data =
        Arguments.createMap().apply {
          putString("requestId", request.id)
          putString("action", request.action)
          putString("payloadJson", request.payloadJson)
        }
      try {
        HeadlessJsTaskContext.getInstance(reactContext)
          .startTask(HeadlessJsTaskConfig(TASK_KEY, data, request.timeoutMs, true))
      } catch (error: Exception) {
        Log.e(TAG, "Could not start the JavaScript task for ${request.action}", error)
        reject(request.id, "Could not start the JavaScript handler for \"${request.action}\": ${error.message}")
      }
    }
  }

  private fun startReactNative(context: Context) {
    val application = context.applicationContext as? ReactApplication
    if (application == null) {
      Log.w(TAG, "Application does not implement ReactApplication; cannot start React Native for a queued call")
      return
    }
    UiThreadUtil.runOnUiThread {
      try {
        application.reactHost?.start()
      } catch (error: Exception) {
        Log.e(TAG, "Failed to start React Native for a queued call", error)
      }
    }
  }
}
