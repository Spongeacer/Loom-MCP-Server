class LoomMcp < Formula
  desc "Semantic persistent context OS for AI agents via MCP"
  homepage "https://github.com/Spongeacer/Loom-MCP-Server"
  url "https://registry.npmjs.org/loom-mcp/-/loom-mcp-0.2.3.tgz"
  # NOTE: run `shasum -a 256` against the published tarball and update this value
  sha256 "2f3ac708116af8aa8a440941f2450fb319eb4539b836b6326051a7d721073c78"
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
