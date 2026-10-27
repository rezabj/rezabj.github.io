require "tmpdir"
require "fileutils"
require "json"
require "rexml/document"

# Build in a temporary copy so the test never publishes a fixture or changes _posts.
source = File.expand_path("..", __dir__)
Dir.mktmpdir("rezab-jekyll-test-") do |dir|
  ignored = %w[.git _site .jekyll-cache .bundle vendor node_modules docs content _legacy]
  Dir.children(source).reject { |name| ignored.include?(name) }.each do |name|
    FileUtils.cp_r(File.join(source, name), dir)
  end
  slug = "markdown-integration-check"
  url = "/integration-test/2020/01/02/#{slug}/"
  File.write(File.join(dir, "_posts", "2020-01-02-#{slug}.md"), <<~MARKDOWN)
    ---
    title: "Markdown integration check"
    categories: [integration-test]
    tags: [fixture-tag]
    description: "A post created only from Markdown."
    ---
    ## Test section

    A **Markdown** paragraph.

    ```powershell
    $value = "<hello> & world"
    ```

    ![Logo](/assets/images/2023/08/logo.png)
  MARKDOWN
  raise "Jekyll build failed" unless system("bundle", "exec", "jekyll", "build", "--source", dir, "--destination", File.join(dir, "_site"), "--trace")
  read = ->(file) { File.read(File.join(dir, "_site", file)) }
  html = read.call("#{url}index.html")
  raise "Markdown was not rendered" unless html.include?("<strong>Markdown</strong>") && html.include?('id="test-section"')
  %w[index.html category/integration-test/index.html tag/fixture-tag/index.html feed/index.xml sitemap.xml].each do |file|
    raise "New post missing from #{file}" unless read.call(file).include?(url)
  end
  posts = JSON.parse(read.call("search.json"))
  raise "Search index missing Markdown body" unless posts.any? { |post| post["url"] == url && post["text"].include?("Markdown paragraph") }
  raise "HTML entities leaked into search text" unless posts.any? { |post| post["url"] == url && post["text"].include?('<hello> & world') }
  REXML::Document.new(read.call("feed/index.xml"))
  REXML::Document.new(read.call("sitemap.xml"))
  raise "Source files leaked into output" if File.exist?(File.join(dir, "_site", "scripts")) || File.exist?(File.join(dir, "_site", "Gemfile"))
  puts "PASS: A new Markdown post appears in the home page, category, tag, search, RSS and sitemap."
end
