/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  webpack: (config, { isServer, webpack }) => {
    // Exclude @huggingface/transformers و onnxruntime-node از server bundle
    if (isServer) {
      // در server-side، @huggingface/transformers را ignore می‌کنیم
      config.externals = config.externals || []
      config.externals.push('@huggingface/transformers')
    } else {
      // در client-side، onnxruntime-node را ignore می‌کنیم
      config.externals = config.externals || {}
      config.externals['@huggingface/transformers'] = false
    }
    
    // Ignore onnxruntime-node و .node files
    config.plugins = config.plugins || []
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^onnxruntime-node$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /\.node$/,
      })
    )
    
    // Resolve fallback برای Node.js modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }
    
    return config
  },
}

module.exports = nextConfig

