import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  entry: './src/index.tsx',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      }
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
    },
    fallback: {
      'process/browser': path.resolve(__dirname, 'node_modules/process/browser.js'),
      "buffer": path.resolve(__dirname, 'node_modules/buffer/index.js'),
      "timers": path.resolve(__dirname, 'node_modules/timers-browserify/main.js'),
      "events": path.resolve(__dirname, 'node_modules/events/events.js'),
      "stream": false,
      "crypto": false,
      "fs": false,
      "path": false,
      "os": false,
      "tls": false,
      "net": false,
    }
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),

    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
      setImmediate: ['timers', 'setImmediate'],
    }),
    new webpack.NormalModuleReplacementPlugin(
      /^perf_hooks$/,
      path.resolve(__dirname, 'webpack-perf-hooks.js')
    ),
  ],
  devServer: {
    port: 3000,
    open: true,
    hot: true,
  },
};