class LoomMcp < Formula
  desc "Semantic persistent context OS for AI agents via MCP"
  homepage "https://github.com/Spongeacer/Loom-MCP-Server"
  url "https://registry.npmjs.org/loom-mcp/-/loom-mcp-0.1.0.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/loom", "doctor"
  end
end
