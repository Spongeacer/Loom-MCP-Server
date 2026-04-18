class LoomMcp < Formula
  desc "Semantic persistent context OS for AI agents via MCP"
  homepage "https://github.com/Spongeacer/Loom-MCP-Server"
  # TODO: Update URL and sha256 for v0.3.0 when the monorepo package is published to npm
  url "https://registry.npmjs.org/loom-mcp/-/loom-mcp-0.2.4.tgz"
  sha256 "5f9dae76d5b704cd51d8804ae9b6ac2772ef1abca4b2c068f1f0cf9bbed7dd0a"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["\#{libexec}/bin/*"]
  end

  test do
    system "\#{bin}/loom", "doctor"
  end
end
