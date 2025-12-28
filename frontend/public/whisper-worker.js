/**
 * Web Worker برای Whisper.js با @huggingface/transformers
 * این Worker در thread جداگانه اجرا می‌شود و Whisper را لود می‌کند
 */

let transcriber = null;
let isInitialized = false;

// Dynamic import برای @huggingface/transformers
// در Worker، از dynamic import استفاده می‌کنیم
async function loadTransformers() {
  try {
    // اول سعی می‌کنیم از npm package استفاده کنیم (اگر در bundle باشد)
    const transformers = await import('@huggingface/transformers');
    console.log('Worker: Using npm package');
    return {
      pipeline: transformers.pipeline,
      env: transformers.env,
    };
  } catch (error) {
    // اگر npm package در دسترس نبود، از CDN استفاده می‌کنیم
    console.warn('Worker: npm package not available, using CDN', error);
    try {
      // امتحان نسخه 2.x که ممکن است stable‌تر باشد
      console.log('Worker: Trying transformers 2.x first...');
      try {
        const transformersModule = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@2.17.2/dist/transformers.min.js');
        console.log('Worker: Using CDN (jsdelivr) - version 2.17.2');
        const env = transformersModule.env;
        console.log('Worker: CDN env object type:', typeof env);
        console.log('Worker: CDN env object is frozen:', Object.isFrozen(env));
        console.log('Worker: CDN env object is sealed:', Object.isSealed(env));
        return { 
          pipeline: transformersModule.pipeline, 
          env: env 
        };
      } catch (v2Error) {
        console.warn('Worker: Version 2.x failed, trying 3.0.0:', v2Error);
        const transformersModule = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js');
        console.log('Worker: Using CDN (jsdelivr) - version 3.0.0');
        const env = transformersModule.env;
        console.log('Worker: CDN env object type:', typeof env);
        console.log('Worker: CDN env object is frozen:', Object.isFrozen(env));
        console.log('Worker: CDN env object is sealed:', Object.isSealed(env));
        return { 
          pipeline: transformersModule.pipeline, 
          env: env 
        };
      }
    } catch (cdnError) {
      console.error('Worker: CDN also failed, trying alternative CDN', cdnError);
      // Fallback به CDN دیگر
      const transformersModule = await import('https://unpkg.com/@huggingface/transformers@2.17.2/dist/transformers.min.js');
      console.log('Worker: Using CDN (unpkg) - version 2.17.2');
      const env = transformersModule.env;
      console.log('Worker: Alternative CDN env object type:', typeof env);
      console.log('Worker: Alternative CDN env object is frozen:', Object.isFrozen(env));
      return { 
        pipeline: transformersModule.pipeline, 
        env: env 
      };
    }
  }
}

// Initialize Whisper
async function initializeWhisper(config) {
  try {
    if (isInitialized && transcriber) {
      return { success: true, message: 'Already initialized' };
    }

    self.postMessage({ type: 'status', message: 'Loading transformers...' });

    const { pipeline, env: transformersEnv } = await loadTransformers();

    // تنظیم remoteURL برای self-hosted models
    const baseURL = config.baseURL || self.location.origin;
    const remoteURL = `${baseURL}/api/models`;
    
    // استفاده از env object که از library آمده است
    // مهم: باید از همان env object استفاده کنیم که library استفاده می‌کند
    const env = transformersEnv;
    
    // تنظیم env properties - @huggingface/transformers از env.remoteURL استفاده می‌کند
    // استفاده از Object.defineProperty برای اطمینان از تنظیم properties
    if (env && typeof env === 'object') {
      // بررسی اینکه env object قابل تغییر است
      console.log('Worker: env object type:', typeof env);
      console.log('Worker: env object keys:', Object.keys(env));
      console.log('Worker: env object is frozen:', Object.isFrozen(env));
      console.log('Worker: env object is sealed:', Object.isSealed(env));
      // مهم: باید قبل از هر چیز، remoteURL را تنظیم کنیم
      // و مطمئن شویم که از default Hugging Face Hub استفاده نمی‌کند
      
      // تنظیم remoteURL - این مهمترین بخش است
      try {
        // حذف remoteURL قبلی اگر وجود دارد
        if ('remoteURL' in env) {
          delete env.remoteURL;
        }
        // اضافه کردن remoteURL جدید
        Object.defineProperty(env, 'remoteURL', {
          value: remoteURL,
          writable: true,
          enumerable: true,
          configurable: true
        });
        console.log('Worker: Set remoteURL to', env.remoteURL);
      } catch (e) {
        console.warn('Worker: Could not set remoteURL:', e);
        // Fallback: سعی می‌کنیم مستقیماً assign کنیم
        try {
          env.remoteURL = remoteURL;
          console.log('Worker: Set remoteURL (fallback) to', env.remoteURL);
        } catch (e2) {
          console.error('Worker: Failed to set remoteURL:', e2);
        }
      }
      
      // تنظیم remoteHost - library ممکن است از این استفاده کند
      try {
        if ('remoteHost' in env) {
          // اگر remoteHost وجود دارد، آن را به baseURL تنظیم می‌کنیم
          const host = new URL(remoteURL).host;
          env.remoteHost = host;
          console.log('Worker: Set remoteHost to', env.remoteHost);
        }
      } catch (e) {
        console.warn('Worker: Could not set remoteHost:', e);
      }
      
      // تنظیم remotePathTemplate - library نیاز به یک string معتبر دارد
      // @huggingface/transformers از remotePathTemplate برای ساخت URL استفاده می‌کند
      // اگر undefined باشد، library سعی می‌کند .replace() را روی undefined فراخوانی کند
      // Format Hugging Face Hub: {model}/resolve/{revision}/{path}
      // API route ما این format را پشتیبانی می‌کند (resolve/{revision} را ignore می‌کند)
      try {
        // حذف remotePathTemplate قبلی اگر وجود دارد
        if ('remotePathTemplate' in env) {
          delete env.remotePathTemplate;
        }
        
        // تنظیم remotePathTemplate - امتحان format ساده
        // ممکن است library با format Hugging Face Hub مشکل داشته باشد
        // بیایید format ساده را امتحان کنیم: {model}/{path}
        const template = '{model}/{path}';
        
        try {
          Object.defineProperty(env, 'remotePathTemplate', {
            value: template,
            writable: true,
            enumerable: true,
            configurable: true
          });
        } catch (defineError) {
          // Fallback: مستقیماً assign کنیم
          env.remotePathTemplate = template;
        }
        
        console.log('Worker: Set remotePathTemplate to:', env.remotePathTemplate);
        console.log('Worker: remotePathTemplate type:', typeof env.remotePathTemplate);
        
        // بررسی نهایی
        if (!env.remotePathTemplate || typeof env.remotePathTemplate !== 'string') {
          throw new Error('remotePathTemplate is not a valid string after setting');
        }
      } catch (e) {
        console.error('Worker: Error setting remotePathTemplate:', e);
        // اگر همه چیز شکست خورد، یک string خالی تنظیم می‌کنیم
        // اما بهتر است format درست را تنظیم کنیم
        try {
          env.remotePathTemplate = '{model}/resolve/{revision}/{path}';
          console.log('Worker: Set remotePathTemplate (fallback):', env.remotePathTemplate);
        } catch (e2) {
          console.error('Worker: Failed to set remotePathTemplate (fallback):', e2);
        }
      }
      
      // فعال کردن استفاده از remote models (از remoteURL خودمان)
      // چون از API route خودمان استفاده می‌کنیم، باید allowRemoteModels = true باشد
      try {
        if ('allowRemoteModels' in env) {
          env.allowRemoteModels = true;
          console.log('Worker: Enabled allowRemoteModels (using our remoteURL)');
        } else {
          Object.defineProperty(env, 'allowRemoteModels', {
            value: true,
            writable: true,
            enumerable: true,
            configurable: true
          });
          console.log('Worker: Added allowRemoteModels = true');
        }
      } catch (e) {
        console.warn('Worker: Could not enable allowRemoteModels:', e);
      }
      
      // حذف localModelPath اگر وجود دارد (تا از remoteURL استفاده کند)
      try {
        if ('localModelPath' in env) {
          delete env.localModelPath;
          console.log('Worker: Removed localModelPath to use remoteURL');
        }
      } catch (e) {
        console.warn('Worker: Could not remove localModelPath:', e);
      }
      
      // غیرفعال کردن allowLocalModels برای اطمینان از استفاده از remoteURL
      try {
        if ('allowLocalModels' in env) {
          env.allowLocalModels = false;
          console.log('Worker: Disabled allowLocalModels');
        } else {
          Object.defineProperty(env, 'allowLocalModels', {
            value: false,
            writable: true,
            enumerable: true,
            configurable: true
          });
          console.log('Worker: Added allowLocalModels = false');
        }
      } catch (e) {
        console.warn('Worker: Could not disable allowLocalModels:', e);
      }
      
      // بررسی تمام properties که ممکن است undefined باشند
      // Library ممکن است از property دیگری استفاده کند
      const envCheck = {
        remoteURL: env.remoteURL,
        remotePathTemplate: env.remotePathTemplate,
        remoteHost: env.remoteHost,
        allowRemoteModels: env.allowRemoteModels,
        allowLocalModels: env.allowLocalModels,
        localModelPath: env.localModelPath,
        hasLocalModelPath: 'localModelPath' in env,
        hasRemoteURL: 'remoteURL' in env,
        hasRemotePathTemplate: 'remotePathTemplate' in env,
        hasRemoteHost: 'remoteHost' in env,
        hasAllowRemoteModels: 'allowRemoteModels' in env,
        hasAllowLocalModels: 'allowLocalModels' in env,
        envKeys: Object.keys(env),
      };
      
      // بررسی اینکه آیا property هایی که ممکن است undefined باشند، string هستند
      const stringProperties = ['remoteURL', 'remotePathTemplate', 'remoteHost', 'localModelPath'];
      for (const prop of stringProperties) {
        if (prop in env && env[prop] !== undefined && typeof env[prop] !== 'string') {
          console.warn(`Worker: ${prop} is not a string:`, typeof env[prop], env[prop]);
        }
        if (prop in env && env[prop] === undefined) {
          console.warn(`Worker: ${prop} is undefined`);
        }
      }
      
      console.log('Worker: Final env state', envCheck);
    } else {
      console.error('Worker: env is not an object:', typeof env, env);
    }

    self.postMessage({ 
      type: 'status', 
      message: 'Creating pipeline...',
      config: {
        remoteURL: env?.remoteURL || remoteURL,
        remotePathTemplate: env?.remotePathTemplate || 'not set',
        allowRemoteModels: env?.allowRemoteModels,
        baseURL: baseURL,
        envType: typeof env,
        envKeys: env ? Object.keys(env) : [],
      }
    });

    // ایجاد pipeline با استفاده از model path که از API route خودمان serve می‌شود
    // برای self-hosted، باید از localModelPath استفاده کنیم
    const modelName = config.modelName || 'Xenova/whisper-small';
    
    // بررسی نهایی env قبل از pipeline
    console.log('Worker: Before pipeline, env state:', {
      remoteURL: env?.remoteURL,
      remotePathTemplate: env?.remotePathTemplate,
      allowRemoteModels: env?.allowRemoteModels,
      hasLocalModelPath: env ? 'localModelPath' in env : false,
      envKeys: env ? Object.keys(env) : [],
    });
    
    self.postMessage({ 
      type: 'status', 
      message: `Loading model: ${modelName} from ${env?.remoteURL || remoteURL}`,
    });
    
    // استفاده از remoteURL (API route خودمان)
    console.log('Worker: Using remoteURL:', env?.remoteURL || remoteURL);
    console.log('Worker: remotePathTemplate:', env?.remotePathTemplate || 'not set');
    
    // بررسی نهایی قبل از pipeline
    if (!env?.remoteURL) {
      throw new Error('remoteURL is not set');
    }
    
    // بررسی نهایی remotePathTemplate - باید یک string معتبر باشد
    if (!env?.remotePathTemplate || typeof env.remotePathTemplate !== 'string') {
      console.error('Worker: remotePathTemplate is invalid, setting default');
      env.remotePathTemplate = '{model}/resolve/{revision}/{path}';
    }
    console.log('Worker: Final remotePathTemplate:', env.remotePathTemplate);
    
    // بررسی نهایی env properties
    console.log('Worker: Final validation:', {
      remoteURL: typeof env.remoteURL,
      remoteURLValue: env.remoteURL,
      hasRemotePathTemplate: 'remotePathTemplate' in env,
      allowRemoteModels: typeof env.allowRemoteModels,
    });
    
    // بررسی نهایی env قبل از pipeline
    console.log('Worker: Final env check before pipeline:', {
      remoteURL: env?.remoteURL,
      remotePathTemplate: env?.remotePathTemplate,
      remotePathTemplateType: typeof env?.remotePathTemplate,
      hasRemotePathTemplate: 'remotePathTemplate' in env,
      allowRemoteModels: env?.allowRemoteModels,
      allowLocalModels: env?.allowLocalModels,
    });
    
    // بررسی نهایی remotePathTemplate - باید یک string معتبر باشد
    if (!env?.remotePathTemplate || typeof env.remotePathTemplate !== 'string' || env.remotePathTemplate.length === 0) {
      console.warn('Worker: remotePathTemplate is invalid, setting default');
      env.remotePathTemplate = '{model}/resolve/{revision}/{path}';
    }
    console.log('Worker: remotePathTemplate before pipeline:', env.remotePathTemplate);
    
    // بررسی نهایی تمام properties که ممکن است undefined باشند
    // Library ممکن است از property دیگری استفاده کند
    const allEnvProps = {
      remoteURL: env.remoteURL,
      remotePathTemplate: env.remotePathTemplate,
      remoteHost: env.remoteHost,
      allowRemoteModels: env.allowRemoteModels,
      allowLocalModels: env.allowLocalModels,
      localModelPath: env.localModelPath,
    };
    
    console.log('Worker: All env properties before pipeline:', allEnvProps);
    
    // بررسی اینکه آیا property هایی که ممکن است undefined باشند، string هستند
    for (const [key, value] of Object.entries(allEnvProps)) {
      if (value !== undefined && typeof value !== 'string' && typeof value !== 'boolean') {
        console.warn(`Worker: ${key} is not a string or boolean:`, typeof value, value);
      }
      if (value === undefined && (key === 'remoteURL' || key === 'remotePathTemplate')) {
        console.error(`Worker: ${key} is undefined!`);
      }
    }
    
    try {
      transcriber = await pipeline(
        'automatic-speech-recognition',
        modelName,
        {
          quantized: true,
          // استفاده از remoteURL که از env استفاده می‌کند
          progress_callback: (progress) => {
            console.log('Worker: Progress:', progress.status, progress.name);
            if (progress.status === 'downloading' || progress.status === 'loading') {
              self.postMessage({
                type: 'progress',
                progress: {
                  name: progress.name,
                  status: progress.status,
                  loaded: progress.loaded || 0,
                  total: progress.total || 0,
                }
              });
            }
          },
        }
      );
    } catch (pipelineError) {
      console.error('Worker: Pipeline error:', pipelineError);
      console.error('Worker: Pipeline error stack:', pipelineError.stack);
      console.error('Worker: Env state at error:', {
        remoteURL: env?.remoteURL,
        remotePathTemplate: env?.remotePathTemplate,
        remotePathTemplateType: typeof env?.remotePathTemplate,
        hasRemotePathTemplate: 'remotePathTemplate' in env,
        envKeys: env ? Object.keys(env) : [],
      });
      throw pipelineError;
    }

    isInitialized = true;
    self.postMessage({ type: 'initialized', success: true });
    return { success: true };
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error.message || 'Failed to initialize Whisper',
      details: error.toString()
    });
    return { success: false, error: error.message };
  }
}

// Transcribe audio
async function transcribeAudio(audioData, options = {}) {
  try {
    if (!transcriber) {
      throw new Error('Transcriber not initialized');
    }

    const result = await transcriber(audioData, {
      return_timestamps: false,
      language: options.language || 'fa',
      ...options,
    });

    return {
      success: true,
      text: result?.text || '',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Transcription failed',
    };
  }
}

// Handle messages from main thread
self.onmessage = async function(event) {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'init':
        await initializeWhisper(data);
        break;

      case 'transcribe':
        const result = await transcribeAudio(data.audioData, data.options);
        self.postMessage({
          type: 'transcription',
          ...result,
        });
        break;

      case 'destroy':
        transcriber = null;
        isInitialized = false;
        self.postMessage({ type: 'destroyed' });
        break;

      default:
        self.postMessage({
          type: 'error',
          error: `Unknown message type: ${type}`,
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message || 'Worker error',
      details: error.toString(),
    });
  }
};

// Error handler
self.onerror = function(error) {
  self.postMessage({
    type: 'error',
    error: 'Worker error',
    details: error.message || error.toString(),
  });
};

