export default {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Video uploads for the breakdown library go through this proxy: up to 200 MB, and slow links need more than 30 s.
  experimental: {proxyClientMaxBodySize: '210mb', proxyTimeout: 600_000},
  async rewrites(){return [{source:'/api/:path*',destination:`http://127.0.0.1:${process.env.AICREATER_API_PORT||8000}/api/:path*`}];},
};
