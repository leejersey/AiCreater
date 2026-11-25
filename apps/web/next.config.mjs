export default {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites(){return [{source:'/api/:path*',destination:`http://127.0.0.1:${process.env.AICREATER_API_PORT||8000}/api/:path*`}];},
};
