class LoomMcp < Formula
  desc "Semantic persistent context OS for AI agents via MCP"
  homepage "https://github.com/Spongeacer/Loom-MCP-Server"
  url "https://registry.npmjs.org/loom-mcp/-/loom-mcp-0.1.1.tgz"
  sha256 "ab90e37a7b18e4d961c0eebcc489a843b3a767811e13d6e9c5833ffa40517a69"
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
