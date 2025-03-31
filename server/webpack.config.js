const slsw = require("serverless-webpack");
const path = require("path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
  entry: slsw.lib.entries,
  target: "node",
  mode: slsw.lib.webpack.isLocal ? "development" : "production",
  externals: [
    nodeExternals({
      allowlist: [/^(?!aws-sdk)/]
    })
  ],
  performance: {
    hints: false,
  },
  optimization: {
    minimize: false, // Lambda doesn't need minimized code
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: "ts-loader",
          options: {
            compilerOptions: {
              skipLibCheck: true,
              transpileOnly: true,
            },
          },
        },
        include: path.resolve(__dirname, "src"),
        exclude: /node_modules/,
      },
      {
        test: /\.mjs$/,
        resolve: { mainFields: ["default"] },
      },
    ],
  },
  resolve: {
    mainFields: ["main", "browser"],
    symlinks: false,
    extensions: [".ts", ".js", ".json"],
    alias: {
      "bignumber.js$": "bignumber.js/bignumber.js",
      "node-fetch$": "node-fetch/lib/index.js",
    },
  },
};
