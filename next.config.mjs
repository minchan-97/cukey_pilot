/** @type {import('next').NextConfig} */
export default {
  webpack(config) {
    config.resolve.alias.canvas = false; // pdfjs가 node용 canvas를 찾지 않게
    return config;
  },
};
