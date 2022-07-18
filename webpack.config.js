const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const Dotenv = require('dotenv-webpack');

module.exports = [
    {
        target: 'node',
        name: 'server',
        mode: 'development',
        entry: './src/server/index.js',
        output: {
            filename: 'main.js',
            path: path.resolve(__dirname, './dist/server'),
        },
        resolve: {
            fallback: {
                "bufferutil": false, 
                "utf-8-validate": false, 
            } 
        },
    },
    {
        target: 'web',
        name: 'client',
        mode: 'development',
        entry: './src/client/index.js',
        output: {
            filename: 'main.js',
            path: path.resolve(__dirname, './dist/client'),
        },
        resolve: {
            fallback: {
                "fs": false,
                "tls": false,
                "net": false,
                "path": false,
                "zlib": false,
                "http": false,
                "https": false,
                "stream": false,
                "crypto": false, 
                "util": require.resolve('util/'), 
                "url": false, 
                "buffer": require.resolve('buffer/'), 
                "bufferutil": false, 
                "os": false, 
                "utf-8-validate": false, 
            } 
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: './src/client/index.html'
            }),
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
                Util: ['util', 'Util'],
                process: 'process/browser',
            }),
            new Dotenv({systemvars: true,}),
        ],
        module: {
            rules: [
                {
                    test: /\.html$/i,
                    loader: "html-loader",
                },
            ],
        },
    }
];